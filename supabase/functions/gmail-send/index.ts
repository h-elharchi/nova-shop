// Edge Function : gmail-send
// Envoie un email via Gmail API et enregistre dans email_messages.
//
// Secrets requis : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Déploiement : supabase functions deploy gmail-send

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API        = 'https://gmail.googleapis.com/gmail/v1'

interface SendPayload {
  email_account_id: string
  to: string
  subject: string
  body_text: string
  reply_to_message_id?: string  // ID du message email_messages auquel on répond
  gmail_thread_id?: string       // Pour répondre dans le même thread Gmail
  order_id?: string
  customer_id?: string
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh: ${await res.text()}`)
  const d = await res.json() as { access_token: string }
  return d.access_token
}

function buildRfc2822(from: string, to: string, subject: string, body: string, threadMessageId?: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
  ]
  if (threadMessageId) lines.push(`In-Reply-To: ${threadMessageId}`, `References: ${threadMessageId}`)
  lines.push('', body)
  return lines.join('\r\n')
}

function encodeBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const clientId       = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret   = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Valider JWT appelant (staff uniquement)
  const callerToken = authHeader.slice(7)
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(callerToken)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (!['admin', 'agent'].includes(profile?.role ?? '')) return json({ error: 'Forbidden' }, 403)

  try {
    const payload = await req.json() as SendPayload
    const { email_account_id, to, subject, body_text, reply_to_message_id, gmail_thread_id, order_id, customer_id } = payload

    if (!email_account_id || !to || !subject || !body_text) {
      return json({ error: 'Missing required fields: email_account_id, to, subject, body_text' }, 400)
    }

    // Charger le compte email
    const { data: account, error: accErr } = await adminClient
      .from('email_accounts')
      .select('gmail_address, vault_refresh_token, is_active')
      .eq('id', email_account_id)
      .single<{ gmail_address: string; vault_refresh_token: string; is_active: boolean }>()

    if (accErr || !account) return json({ error: 'Email account not found' }, 404)
    if (!account.is_active) return json({ error: 'Email account is inactive' }, 400)
    if (!account.vault_refresh_token) return json({ error: 'No refresh token — reconnect Gmail' }, 400)

    // Lire le refresh token depuis le Vault
    const { data: refreshToken, error: vaultErr } = await adminClient.rpc('read_vault_secret', {
      p_id: account.vault_refresh_token,
    })
    if (vaultErr || !refreshToken) return json({ error: 'Vault read error' }, 500)

    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken as string)

    // Construire le message RFC 2822
    const raw = buildRfc2822(account.gmail_address, to, subject, body_text)
    const encoded = encodeBase64Url(raw)

    // Envoyer via Gmail API
    const sendBody: Record<string, string> = { raw: encoded }
    if (gmail_thread_id) sendBody.threadId = gmail_thread_id

    const sendRes = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendBody),
    })

    if (!sendRes.ok) {
      const err = await sendRes.text()
      console.error('[gmail-send] send error:', err)
      return json({ error: `Gmail API error: ${sendRes.status}` }, 502)
    }

    const sentMsg = await sendRes.json() as { id: string; threadId: string }

    // Enregistrer le message envoyé
    const { data: insertedMsg, error: insertErr } = await adminClient
      .from('email_messages')
      .insert({
        email_account_id,
        gmail_message_id: sentMsg.id,
        gmail_thread_id:  sentMsg.threadId,
        subject,
        from_address:     account.gmail_address,
        to_address:       to,
        body_text,
        direction:        'out',
        status:           'replied',
        customer_id:      customer_id || null,
        order_id:         order_id || null,
        received_at:      new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr) console.warn('[gmail-send] insert log error:', insertErr)

    // Marquer le message original comme 'replied'
    if (reply_to_message_id) {
      await adminClient
        .from('email_messages')
        .update({ status: 'replied' })
        .eq('id', reply_to_message_id)
    }

    return json({ success: true, message_id: sentMsg.id, logged: insertedMsg })
  } catch (err) {
    console.error('[gmail-send] fatal:', err)
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
