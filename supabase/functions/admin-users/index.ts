// Edge Function : admin-users
// Gestion des comptes staff (admin + agent)
// Nécessite : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectés par Supabase)
//             SITE_URL (à définir dans Supabase Dashboard → Edge Functions → Secrets)
//
// Déploiement : supabase functions deploy admin-users
//
// Toutes les opérations nécessitent un JWT d'un admin actif.
// Le service_role_key n'est jamais exposé au frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface StaffProfile {
  id: string
  email: string
  role: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid Authorization header' }, 401)
    }

    const callerToken = authHeader.slice(7)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173/nova-shop'

    // Client privilegié (service_role) — jamais exposé au frontend
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Vérifier le JWT du caller
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(callerToken)
    if (authError || !caller) {
      return json({ error: 'Invalid or expired token' }, 401)
    }

    // Vérifier que le caller est un admin actif
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .single<{ role: string; is_active: boolean }>()

    if (profileError || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return json({ error: 'Forbidden — admin access required' }, 403)
    }

    const body = await req.json() as Record<string, unknown>
    const { action } = body

    const audit = async (actionType: string, targetId: string | null, details: Record<string, unknown>) => {
      await adminClient.from('admin_audit_log').insert({
        actor_id: caller.id,
        action: actionType,
        target_user_id: targetId,
        details,
      })
    }

    // ─── Actions ──────────────────────────────────────────────────────────────

    if (action === 'list') {
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, email, role, first_name, last_name, avatar_url, is_active, last_login_at, created_at')
        .in('role', ['admin', 'agent'])
        .order('created_at', { ascending: true })

      if (error) throw error
      return json({ data })
    }

    if (action === 'invite') {
      const email = body.email as string | undefined
      const role  = (body.role as string | undefined) ?? 'agent'
      const firstName = (body.first_name as string | undefined) ?? ''
      const lastName  = (body.last_name  as string | undefined) ?? ''

      if (!email) return json({ error: 'email is required' }, 400)
      if (!['admin', 'agent'].includes(role)) return json({ error: 'role must be admin or agent' }, 400)

      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { role, first_name: firstName, last_name: lastName },
        redirectTo: `${siteUrl}/#/set-password`,
      })

      if (inviteError) return json({ error: inviteError.message }, 400)

      if (invited.user) {
        await adminClient.from('profiles').upsert({
          id: invited.user.id,
          email,
          role,
          first_name: firstName || null,
          last_name: lastName || null,
          is_active: true,
        }, { onConflict: 'id' })
      }

      await audit('invite_user', invited.user?.id ?? null, { email, role })
      return json({ data: { id: invited.user?.id } })
    }

    if (action === 'update') {
      const userId   = body.user_id as string | undefined
      const newRole  = body.role     as string | undefined
      const isActive = body.is_active as boolean | undefined

      if (!userId) return json({ error: 'user_id is required' }, 400)

      // Un admin ne peut pas se dégrader lui-même via l'API
      if (userId === caller.id && newRole && newRole !== 'admin') {
        return json({ error: 'Cannot change own role' }, 400)
      }

      const updates: Partial<StaffProfile> = {}
      if (newRole  !== undefined) updates.role      = newRole
      if (isActive !== undefined) updates.is_active = isActive
      if (body.first_name !== undefined) updates.first_name = body.first_name as string | null
      if (body.last_name  !== undefined) updates.last_name  = body.last_name  as string | null

      const { error } = await adminClient.from('profiles').update(updates).eq('id', userId)
      if (error) throw error

      await audit('update_user', userId, updates as Record<string, unknown>)
      return json({ data: { success: true } })
    }

    if (action === 'reset-password') {
      const email = body.email as string | undefined
      if (!email) return json({ error: 'email is required' }, 400)

      // Trouver l'utilisateur
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (listError) throw listError

      const targetUser = users.find((u) => u.email === email)
      if (!targetUser) return json({ error: 'User not found' }, 404)

      // Générer un lien de récupération (envoie un email)
      const { error: resetError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/#/set-password` },
      })

      if (resetError) throw resetError

      await audit('reset_password', targetUser.id, { email })
      return json({ data: { success: true } })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[admin-users]', message)
    return json({ error: message }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
