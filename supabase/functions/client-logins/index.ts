import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const encryptionSecret = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY')!
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

async function getKey() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionSecret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), new TextEncoder().encode(value))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`
}

async function decrypt(value: string) {
  const [iv, encrypted] = value.split('.')
  if (!iv || !encrypted) throw new Error('Credencial criptografada invalida')
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, await getKey(), base64ToBytes(encrypted))
  return new TextDecoder().decode(clear)
}

function required(value: unknown, label: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`Informe ${label}`)
  return text
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!encryptionSecret) throw new Error('Chave de criptografia nao configurada')
    const authorization = req.headers.get('Authorization') || ''
    const requester = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await requester.auth.getUser()
    if (authError || !user) return Response.json({ error: 'Nao autorizado' }, { status: 401, headers: corsHeaders })
    const { data: profile } = await admin.from('profiles').select('id, ativo, role').eq('id', user.id).maybeSingle()
    if (!profile?.ativo) return Response.json({ error: 'Usuario inativo' }, { status: 403, headers: corsHeaders })
    if (profile.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    if (body.action === 'list') {
      const { data, error } = await admin
        .from('client_logins')
        .select('id, cliente_id, empresa, marca, tipo_acesso, sistema_equipamento, url_ip, usuario_encrypted, senha_encrypted, observacoes, created_at, updated_at, cliente:clientes(id,nome)')
        .order('updated_at', { ascending: false })
      if (error) throw error
      const records = await Promise.all((data || []).map(async item => ({
        id: item.id, cliente_id: item.cliente_id, cliente: item.cliente,
        empresa: item.empresa, marca: item.marca, tipo_acesso: item.tipo_acesso,
        sistema_equipamento: item.sistema_equipamento, url_ip: item.url_ip,
        usuario: await decrypt(item.usuario_encrypted), senha: await decrypt(item.senha_encrypted),
        observacoes: item.observacoes, created_at: item.created_at, updated_at: item.updated_at,
      })))
      return Response.json({ data: records }, { headers: corsHeaders })
    }

    if (body.action === 'delete') {
      const { error } = await admin.from('client_logins').delete().eq('id', required(body.id, 'o registro'))
      if (error) throw error
      return Response.json({ ok: true }, { headers: corsHeaders })
    }

    if (body.action === 'save') {
      const payload = {
        cliente_id: required(body.cliente_id, 'o cliente'),
        empresa: typeof body.empresa === 'string' && body.empresa.trim() ? body.empresa.trim() : null,
        marca: body.marca === 'generico' ? body.marca : null,
        tipo_acesso: required(body.tipo_acesso, 'o tipo de acesso'),
        sistema_equipamento: required(body.sistema_equipamento, 'o sistema ou equipamento'),
        url_ip: typeof body.url_ip === 'string' && body.url_ip.trim() ? body.url_ip.trim() : null,
        usuario_encrypted: await encrypt(required(body.usuario, 'o usuario')),
        senha_encrypted: await encrypt(required(body.senha, 'a senha')),
        observacoes: typeof body.observacoes === 'string' && body.observacoes.trim() ? body.observacoes.trim() : null,
        created_by: user.id,
      }
      const operation = body.id
        ? admin.from('client_logins').update(payload).eq('id', body.id).select('id').single()
        : admin.from('client_logins').insert(payload).select('id').single()
      const { data, error } = await operation
      if (error) throw error
      return Response.json({ data }, { headers: corsHeaders })
    }

    return Response.json({ error: 'Acao invalida' }, { status: 400, headers: corsHeaders })
  } catch (error) {
    console.error(error)
    return Response.json({ error: error instanceof Error ? error.message : 'Erro interno' }, { status: 500, headers: corsHeaders })
  }
})
