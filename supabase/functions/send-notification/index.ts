import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT')!

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type PushPayload = { title: string; body: string; url: string; tag: string }
type SubscriptionRow = { id: string; subscription: unknown }

async function entregarAssinaturas(subscriptions: SubscriptionRow[], payload: PushPayload) {
  let sent = 0
  let failed = 0
  let removed = 0
  const errors: Array<{ statusCode?: number; message: string }> = []

  await Promise.all(subscriptions.map(async item => {
    try {
      const subscription = typeof item.subscription === 'string' ? JSON.parse(item.subscription) : item.subscription
      await webpush.sendNotification(subscription, JSON.stringify(payload))
      sent += 1
    } catch (error) {
      failed += 1
      const typedError = error as { statusCode?: number; message?: string; body?: string }
      const statusCode = typedError.statusCode
      const message = typedError.message || typedError.body || 'Falha desconhecida no provedor push'
      errors.push({ statusCode, message })
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', item.id)
        removed += 1
      }
      console.error('Falha em uma inscricao push:', { statusCode, message })
    }
  }))

  return { subscriptions: subscriptions.length, sent, failed, removed, errors: errors.slice(0, 5) }
}

async function enviar(payload: PushPayload, options: { adminsOnly?: boolean; excludeUserId?: string } = {}) {
  let query = admin.from('profiles').select('id').eq('ativo', true)
  if (options.adminsOnly) query = query.eq('role', 'admin')
  if (options.excludeUserId) query = query.neq('id', options.excludeUserId)

  const { data: recipients, error: profileError } = await query
  if (profileError) throw profileError
  const recipientIds = (recipients || []).map(item => item.id)
  if (!recipientIds.length) return { sent: 0, failed: 0 }

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, subscription')
    .in('user_id', recipientIds)
    .eq('enabled', true)
  if (error) throw error
  return entregarAssinaturas((subscriptions || []) as SubscriptionRow[], payload)
}

async function enviarTeste(userId: string) {
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)
    .eq('enabled', true)
  if (error) throw error

  return entregarAssinaturas((subscriptions || []) as SubscriptionRow[], {
    title: 'Notificacoes funcionando',
    body: 'Este aparelho esta pronto para receber os alertas do SenaGest.',
    url: '/dashboard',
    tag: `push-test-${Date.now()}`,
  })
}

async function verificarEstoque(productId: string) {
  const { data: produto, error } = await admin
    .from('produtos')
    .select('id, nome, quantidade, estoque_minimo, unidade, ativo')
    .eq('id', productId)
    .single()
  if (error || !produto) throw error || new Error('Produto nao encontrado')

  const quantidade = Number(produto.quantidade || 0)
  const minimo = Number(produto.estoque_minimo || 0)
  const abaixoDoMinimo = produto.ativo && quantidade <= minimo
  const { data: estado } = await admin
    .from('stock_notification_state').select('alert_active, last_quantity').eq('product_id', productId).maybeSingle()

  const agora = new Date().toISOString()
  const quantidadeAnterior = estado?.last_quantity == null ? null : Number(estado.last_quantity)
  const saldoAumentou = quantidadeAnterior !== null && quantidade > quantidadeAnterior

  if (!produto.ativo) {
    await admin.from('stock_notification_state').upsert({
      product_id: productId, alert_active: false, last_quantity: quantidade, updated_at: agora,
    })
    return { status: 'inactive', sent: 0 }
  }

  if (!abaixoDoMinimo) {
    const foiReposto = Boolean(estado?.alert_active) && (quantidadeAnterior === null || saldoAumentou)
    const resultado = foiReposto ? await enviar({
      title: 'Estoque reposto',
      body: `${produto.nome} foi reposto. Saldo atual: ${quantidade} ${produto.unidade || 'un'}.`,
      url: '/estoque',
      tag: `stock-replenished-${productId}-${Date.now()}`,
    }, { adminsOnly: true }) : { sent: 0, failed: 0 }

    await admin.from('stock_notification_state').upsert({
      product_id: productId,
      alert_active: false,
      last_quantity: quantidade,
      ...(foiReposto ? { last_notified_at: agora } : {}),
      updated_at: agora,
    })
    return { status: foiReposto ? 'replenished' : 'reset', ...resultado }
  }

  if (estado?.alert_active) {
    if (saldoAumentou) {
      const resultado = await enviar({
        title: 'Estoque reposto parcialmente',
        body: `${produto.nome} recebeu reposicao. Saldo atual: ${quantidade} ${produto.unidade || 'un'} (minimo: ${minimo}).`,
        url: '/estoque?status=baixo',
        tag: `stock-replenished-${productId}-${Date.now()}`,
      }, { adminsOnly: true })

      await admin.from('stock_notification_state').upsert({
        product_id: productId, alert_active: true, last_quantity: quantidade, last_notified_at: agora, updated_at: agora,
      })
      return { status: 'partially_replenished', ...resultado }
    }

    await admin.from('stock_notification_state').upsert({
      product_id: productId, alert_active: true, last_quantity: quantidade, updated_at: agora,
    })
    return { status: 'duplicate', sent: 0 }
  }

  const resultado = await enviar({
    title: 'Estoque minimo atingido',
    body: `${produto.nome}: ${quantidade} ${produto.unidade || 'un'} disponivel(is). Minimo: ${minimo}.`,
    url: '/estoque?status=baixo',
    tag: `stock-${productId}`,
  }, { adminsOnly: true })

  await admin.from('stock_notification_state').upsert({
    product_id: productId, alert_active: true, last_quantity: quantidade, last_notified_at: agora, updated_at: agora,
  })
  return { status: 'notified', ...resultado }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization') || ''
    const body = await req.json()
    const requester = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await requester.auth.getUser()
    if (authError || !user) return Response.json({ error: 'Nao autorizado' }, { status: 401, headers: corsHeaders })

    if (body.type === 'test') {
      const delivery = await enviarTeste(user.id)
      if (!delivery.subscriptions) {
        return Response.json({
          error: 'Nenhum aparelho ativo foi encontrado para este usuario. Ative os alertas novamente.',
          delivery,
        }, { status: 409, headers: corsHeaders })
      }
      return Response.json({
        status: delivery.sent > 0 ? 'delivered' : 'failed',
        delivery,
      }, { status: delivery.sent > 0 ? 200 : 502, headers: corsHeaders })
    }

    if (body.type === 'stock' && typeof body.productId === 'string') {
      return Response.json(await verificarEstoque(body.productId), { headers: corsHeaders })
    }

    if (body.type === 'service' && typeof body.serviceId === 'string') {
      const { data: service, error } = await admin
        .from('servicos')
        .select('id, tecnico_id, status, finalizado_em, cliente:clientes(nome), tecnico:profiles(nome), itens:servico_itens(produto_id)')
        .eq('id', body.serviceId).single()
      if (error || !service) throw error || new Error('Servico nao encontrado')
      if (service.status !== 'finalizado') throw new Error('Servico ainda nao foi finalizado')
      const eventKey = `service:${body.serviceId}:${service.finalizado_em}`
      const { data: existing } = await admin.from('notification_events').select('event_key').eq('event_key', eventKey).maybeSingle()
      if (existing) return Response.json({ status: 'duplicate' }, { headers: corsHeaders })

      const { data: requesterProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (service.tecnico_id !== user.id && requesterProfile?.role !== 'admin') throw new Error('Servico nao pertence ao usuario')

      const typed = service as unknown as {
        tecnico?: { nome?: string }; cliente?: { nome?: string }; itens?: Array<{ produto_id: string }>
      }
      const tecnico = typed.tecnico?.nome || user.email?.split('@')[0] || 'Um tecnico'
      const cliente = typed.cliente?.nome ? ` para ${typed.cliente.nome}` : ''
      const pushResult = await enviar({
        title: 'Novo servico registrado',
        body: `${tecnico} registrou um servico${cliente} com ${typed.itens?.length || 0} item(ns).`,
        url: '/servicos', tag: eventKey,
      }, { adminsOnly: true })

      await admin.from('notification_events').insert({ event_key: eventKey, event_type: 'service' })
      const productIds = [...new Set((typed.itens || []).map(item => item.produto_id).filter(Boolean))]
      const stockResults = await Promise.all(productIds.map(productId => verificarEstoque(productId)))
      return Response.json({ status: 'notified', push: pushResult, stock: stockResults }, { headers: corsHeaders })
    }

    if (body.type === 'time_entry' && typeof body.entryId === 'string') {
      const eventKey = `time_entry:${body.entryId}`
      const { data: existing } = await admin.from('notification_events').select('event_key').eq('event_key', eventKey).maybeSingle()
      if (existing) return Response.json({ status: 'duplicate' }, { headers: corsHeaders })

      const { data: entry, error } = await admin
        .from('time_entries').select('id, user_id, entry_type, occurred_at, user:profiles(nome)').eq('id', body.entryId).single()
      if (error || !entry) throw error || new Error('Registro de ponto nao encontrado')
      if (entry.user_id !== user.id) throw new Error('Registro nao pertence ao usuario')

      const typed = entry as unknown as { user?: { nome?: string }; entry_type: string; occurred_at: string }
      const labels: Record<string, string> = {
        entrada: 'Entrada', saida_almoco: 'Saida para almoco', retorno_almoco: 'Retorno do almoco', saida: 'Saida',
      }
      const time = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
      }).format(new Date(typed.occurred_at))
      const result = await enviar({
        title: 'Novo registro de ponto',
        body: `${typed.user?.nome || 'Um usuario'} registrou ${labels[typed.entry_type] || typed.entry_type} as ${time}.`,
        url: '/ponto', tag: eventKey,
      })
      await admin.from('notification_events').insert({ event_key: eventKey, event_type: 'time_entry' })
      return Response.json({ status: 'notified', push: result }, { headers: corsHeaders })
    }

    if (body.type === 'tool_request' && Number.isInteger(body.requestId)) {
      const eventKey = `tool_request:${body.requestId}`
      const { data: existing } = await admin.from('notification_events').select('event_key').eq('event_key', eventKey).maybeSingle()
      if (existing) return Response.json({ status: 'duplicate' }, { headers: corsHeaders })

      const { data: request, error } = await admin
        .from('pedidos_ferramentas')
        .select('id, descricao, solicitante, solicitante_id, status')
        .eq('id', body.requestId)
        .single()
      if (error || !request) throw error || new Error('Pedido de ferramenta nao encontrado')

      const { data: requesterProfile } = await admin
        .from('profiles')
        .select('role, nome')
        .eq('id', user.id)
        .maybeSingle()
      const ownsRequest = request.solicitante_id === user.id ||
        (!request.solicitante_id && request.solicitante === user.email)
      if (!ownsRequest && requesterProfile?.role !== 'admin') {
        throw new Error('Pedido nao pertence ao usuario')
      }

      const summary = String(request.descricao || '').replace(/\s+/g, ' ').trim()
      const shortSummary = summary.length > 110 ? `${summary.slice(0, 107)}...` : summary
      const result = await enviar({
        title: 'Novo pedido de ferramenta',
        body: `${requesterProfile?.nome || request.solicitante || 'Um usuario'} pediu: ${shortSummary}`,
        url: '/pedidos',
        tag: eventKey,
      }, { excludeUserId: user.id })

      await admin.from('notification_events').insert({ event_key: eventKey, event_type: 'tool_request' })
      return Response.json({ status: 'notified', push: result }, { headers: corsHeaders })
    }

    if (body.type === 'tool_returned' && Number.isInteger(body.requestId)) {
      const { data: request, error } = await admin
        .from('pedidos_ferramentas')
        .select('id, descricao, status, concluido_por, concluido_em')
        .eq('id', body.requestId)
        .single()
      if (error || !request) throw error || new Error('Pedido de ferramenta nao encontrado')
      if (request.status !== 'concluido' || !request.concluido_em) throw new Error('Pedido ainda nao foi concluido')

      const { data: requesterProfile } = await admin.from('profiles').select('role, nome').eq('id', user.id).maybeSingle()
      if (request.concluido_por !== user.id && requesterProfile?.role !== 'admin') {
        throw new Error('Conclusao nao pertence ao usuario')
      }

      const eventKey = `tool_returned:${request.id}:${request.concluido_em}`
      const { data: existing } = await admin.from('notification_events').select('event_key').eq('event_key', eventKey).maybeSingle()
      if (existing) return Response.json({ status: 'duplicate' }, { headers: corsHeaders })

      const summary = String(request.descricao || '').replace(/\s+/g, ' ').trim()
      const shortSummary = summary.length > 110 ? `${summary.slice(0, 107)}...` : summary
      const result = await enviar({
        title: 'Ferramenta reposta',
        body: `${requesterProfile?.nome || user.email?.split('@')[0] || 'Um usuario'} confirmou a reposicao: ${shortSummary}`,
        url: '/pedidos',
        tag: eventKey,
      })

      await admin.from('notification_events').insert({ event_key: eventKey, event_type: 'tool_returned' })
      return Response.json({ status: 'notified', push: result }, { headers: corsHeaders })
    }

    return Response.json({ error: 'Evento invalido' }, { status: 400, headers: corsHeaders })
  } catch (error) {
    console.error(error)
    return Response.json({ error: error instanceof Error ? error.message : 'Erro interno' }, { status: 500, headers: corsHeaders })
  }
})
