// Edge Function : gmail-oauth-callback
// Gère le flux OAuth2 Gmail en deux modes :
//   POST { action: 'get_auth_url', label, account_email }  → retourne l'URL Google OAuth
//   GET  ?code=...&state=...                                → callback Google → stocke en Vault → redirect frontend
//
// Secrets requis (Supabase Dashboard → Edge Functions → Secrets) :
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SITE_URL
//
// Déploiement : supabase functions deploy gmail-oauth-callback

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const clientId         = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret     = Deno.env.get('GOOGLE_CLIENT_SECRET')!
  const siteUrl          = Deno.env.get('SITE_URL') ?? 'http://localhost:5173/nova-shop'

  const functionUrl      = `${supabaseUrl}/functions/v1/gmail-oauth-callback`

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Mode POST : générer l'URL OAuth ───────────────────────────────
  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const token = authHeader.slice(7)
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    // Vérifier que le caller est admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single<{ role: string }>()

    if (profile?.role !== 'admin') return json({ error: 'Admin only' }, 403)

    try {
      const body = await req.json() as { action: string; label: string; account_email?: string }
      if (body.action !== 'get_auth_url') return json({ error: 'Unknown action' }, 400)

      const state = btoa(JSON.stringify({ label: body.label, nonce: crypto.randomUUID() }))

      const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  functionUrl,
        response_type: 'code',
        scope:         GMAIL_SCOPES,
        access_type:   'offline',
        prompt:        'consent',
        state,
      })

      return json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` })
    } catch {
      return json({ error: 'Bad request' }, 400)
    }
  }

  // ── Mode GET : callback Google ────────────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url)
    const code   = url.searchParams.get('code')
    const state  = url.searchParams.get('state')
    const errParam = url.searchParams.get('error')

    const frontendBase = `${siteUrl}/#/admin/email-settings`

    if (errParam) {
      return Response.redirect(`${frontendBase}?oauth_error=${encodeURIComponent(errParam)}`, 302)
    }

    if (!code || !state) {
      return Response.redirect(`${frontendBase}?oauth_error=missing_params`, 302)
    }

    let label = 'Gmail'
    try {
      const decoded = JSON.parse(atob(state))
      label = decoded.label ?? 'Gmail'
    } catch { /* ignore */ }

    // Échanger le code contre les tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  functionUrl,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[gmail-oauth] token exchange failed:', err)
      return Response.redirect(`${frontendBase}?oauth_error=token_exchange_failed`, 302)
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: string
      id_token?: string
    }

    if (!tokens.refresh_token) {
      return Response.redirect(`${frontendBase}?oauth_error=no_refresh_token`, 302)
    }

    // Récupérer l'adresse Gmail via l'API Gmail Profile (le scope userinfo.email n'est pas demandé)
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!profileRes.ok) {
      console.error('[gmail-oauth] profile fetch failed:', await profileRes.text())
      return Response.redirect(`${frontendBase}?oauth_error=profile_fetch_failed`, 302)
    }
    const googleProfile = await profileRes.json() as { emailAddress: string }
    const gmailAddress = googleProfile.emailAddress

    if (!gmailAddress) {
      console.error('[gmail-oauth] emailAddress missing in profile response', googleProfile)
      return Response.redirect(`${frontendBase}?oauth_error=email_missing`, 302)
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Vérifier si un compte existe déjà pour cet email
    const { data: existing } = await adminClient
      .from('email_accounts')
      .select('id, vault_refresh_token')
      .eq('gmail_address', gmailAddress)
      .maybeSingle()

    let vaultId: string

    if (existing?.vault_refresh_token) {
      // Mettre à jour le secret existant dans le Vault
      const { error: updateErr } = await adminClient.rpc('update_vault_secret', {
        p_id:       existing.vault_refresh_token,
        p_new_value: tokens.refresh_token,
      })
      if (updateErr) {
        console.error('[gmail-oauth] vault update error:', updateErr)
        return Response.redirect(`${frontendBase}?oauth_error=vault_error`, 302)
      }
      vaultId = existing.vault_refresh_token
    } else {
      // Créer un nouveau secret dans le Vault (nom unique via UUID)
      const { data: newVaultId, error: vaultErr } = await adminClient.rpc('store_vault_secret', {
        p_value: tokens.refresh_token,
        p_name:  `gmail_refresh_${gmailAddress}_${crypto.randomUUID()}`,
      })
      if (vaultErr) {
        console.error('[gmail-oauth] vault create error:', vaultErr)
        return Response.redirect(`${frontendBase}?oauth_error=vault_error`, 302)
      }
      vaultId = newVaultId
    }

    // Créer ou mettre à jour le compte email
    const { error: upsertErr } = await adminClient
      .from('email_accounts')
      .upsert({
        label,
        gmail_address:       gmailAddress,
        vault_refresh_token: vaultId,
        token_expires_at:    expiresAt,
        is_active:           true,
      }, { onConflict: 'gmail_address' })

    if (upsertErr) {
      console.error('[gmail-oauth] upsert error:', upsertErr)
      return Response.redirect(`${frontendBase}?oauth_error=db_error`, 302)
    }

    return Response.redirect(`${frontendBase}?oauth_success=1&account=${encodeURIComponent(gmailAddress)}`, 302)
  }

  return json({ error: 'Method not allowed' }, 405)
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
