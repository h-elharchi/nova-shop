// Edge Function : gmail-sync
// Synchronise les emails Gmail entrants pour tous les comptes actifs.
// Appelée par pg_cron toutes les 5 min ou manuellement par le frontend.
//
// Secrets requis : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Déploiement : supabase functions deploy gmail-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1'

interface GmailMessage {
  id: string
  threadId: string
}

interface GmailMessageDetail {
  id: string
  threadId: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{ mimeType: string; body?: { data?: string } }>
  }
  internalDate: string
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBase64Url(data: string): string {
  try {
    return atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return ''
  }
}

function extractBody(msg: GmailMessageDetail): { text: string; html: string } {
  const parts = msg.payload.parts ?? []
  let text = ''
  let html = ''

  if (parts.length === 0 && msg.payload.body?.data) {
    text = decodeBase64Url(msg.payload.body.data)
  }

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data)  text = decodeBase64Url(part.body.data)
    if (part.mimeType === 'text/html'  && part.body?.data)  html = decodeBase64Url(part.body.data)
    // nested multipart
    for (const sub of (part as unknown as { parts?: typeof parts }).parts ?? []) {
      if (sub.mimeType === 'text/plain' && sub.body?.data) text = decodeBase64Url(sub.body.data)
      if (sub.mimeType === 'text/html'  && sub.body?.data) html = decodeBase64Url(sub.body.data)
    }
  }

  return { text, html }
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
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const clientId       = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret   = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  // Accepter les appels depuis pg_cron (pas de JWT) ou du frontend (JWT admin)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Charger tous les comptes actifs avec un vault token
    const { data: accounts, error: accErr } = await adminClient
      .from('email_accounts')
      .select('id, gmail_address, vault_refresh_token, last_sync_at')
      .eq('is_active', true)
      .not('vault_refresh_token', 'is', null)

    if (accErr) throw accErr
    if (!accounts || accounts.length === 0) {
      return json({ synced: 0, accounts: 0 })
    }

    let totalFetched = 0

    for (const account of accounts) {
      try {
        // Lire le refresh token depuis le Vault
        const { data: refreshToken, error: vaultErr } = await adminClient.rpc('read_vault_secret', {
          p_id: account.vault_refresh_token,
        })
        if (vaultErr || !refreshToken) {
          console.error(`[gmail-sync] vault error for ${account.gmail_address}:`, vaultErr)
          continue
        }

        // Obtenir un access token frais
        const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken as string)

        // Construire la requête de liste — uniquement depuis la dernière sync
        const afterDate = account.last_sync_at
          ? new Date(account.last_sync_at)
          : new Date(Date.now() - 7 * 24 * 3600 * 1000) // 7 jours max au premier sync

        // Gmail query: messages entrants depuis last_sync_at
        const afterEpoch = Math.floor(afterDate.getTime() / 1000)
        const listUrl = `${GMAIL_API}/users/me/messages?maxResults=50&q=is:inbox after:${afterEpoch}`

        const listRes = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!listRes.ok) {
          console.error(`[gmail-sync] list failed for ${account.gmail_address}: ${listRes.status}`)
          continue
        }

        const listData = await listRes.json() as { messages?: GmailMessage[] }
        const messages = listData.messages ?? []
        let fetchedCount = 0

        for (const msg of messages) {
          // Vérifier si déjà importé
          const { count } = await adminClient
            .from('email_messages')
            .select('id', { count: 'exact', head: true })
            .eq('gmail_message_id', msg.id)

          if ((count ?? 0) > 0) continue

          // Récupérer le détail du message
          const detailRes = await fetch(`${GMAIL_API}/users/me/messages/${msg.id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!detailRes.ok) continue

          const detail = await detailRes.json() as GmailMessageDetail
          const headers = detail.payload.headers
          const subject     = getHeader(headers, 'Subject')
          const fromAddress = getHeader(headers, 'From')
          const toAddress   = getHeader(headers, 'To')
          const receivedAt  = new Date(parseInt(detail.internalDate)).toISOString()

          const { text, html } = extractBody(detail)

          // Tenter de matcher un client par email
          const emailMatch = fromAddress.match(/<([^>]+)>/)
          const senderEmail = emailMatch ? emailMatch[1] : fromAddress
          const { data: customerId } = await adminClient.rpc('match_customer_by_email_address', {
            p_from_address: senderEmail,
          })

          const { error: insertErr } = await adminClient
            .from('email_messages')
            .insert({
              email_account_id: account.id,
              gmail_message_id: detail.id,
              gmail_thread_id:  detail.threadId,
              subject:          subject || '(sans objet)',
              from_address:     fromAddress,
              to_address:       toAddress,
              body_text:        text || null,
              body_html:        html || null,
              direction:        'in',
              status:           'new',
              customer_id:      customerId || null,
              received_at:      receivedAt,
            })

          if (!insertErr) fetchedCount++
        }

        // Mettre à jour last_sync_at et logger
        await adminClient
          .from('email_accounts')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', account.id)

        await adminClient
          .from('email_sync_log')
          .insert({
            email_account_id: account.id,
            messages_fetched: fetchedCount,
          })

        totalFetched += fetchedCount
      } catch (accountErr) {
        console.error(`[gmail-sync] error for ${account.gmail_address}:`, accountErr)
        await adminClient
          .from('email_sync_log')
          .insert({
            email_account_id: account.id,
            messages_fetched: 0,
            error: accountErr instanceof Error ? accountErr.message : String(accountErr),
          })
      }
    }

    return json({ synced: totalFetched, accounts: accounts.length })
  } catch (err) {
    console.error('[gmail-sync] fatal:', err)
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
