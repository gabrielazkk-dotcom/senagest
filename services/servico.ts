import { supabase } from '../lib/supabase'
import { Cliente, ProdutoComStatus } from '../types'
import { solicitarNotificacao } from '../lib/notifications'

export type ServicoStatus = 'em_andamento' | 'finalizado' | 'cancelado'

export type ServicoItemInput = {
  produto: ProdutoComStatus
  quantidade: number
  observacao?: string
}

export type ServicoResumo = {
  id: string
  referencia: string
  cliente?: Cliente
  tecnico?: { id: string; nome: string }
  descricao: string
  observacoes?: string
  status: ServicoStatus
  estoque_aplicado: boolean
  created_at: string
  iniciado_em: string
  finalizado_em?: string
  reaberto_em?: string
  fotos_urls: string[]
  videos_urls: string[]
  itens: Array<{
    id: string
    produto_id: string
    produto_nome: string
    unidade: string
    quantidade: number
    observacao?: string
    produto?: ProdutoComStatus
  }>
}

type ServiceRow = Omit<ServicoResumo, 'referencia' | 'cliente' | 'tecnico' | 'itens'> & {
  cliente?: Cliente | null
  tecnico?: { id: string; nome: string } | null
  itens?: Array<{
    id: string
    produto_id: string
    quantidade: number
    observacao?: string | null
    produto?: ProdutoComStatus | null
  }>
}

function normalize(row: ServiceRow): ServicoResumo {
  return {
    ...row,
    referencia: `servico:${row.id}`,
    cliente: row.cliente || undefined,
    tecnico: row.tecnico || undefined,
    observacoes: row.observacoes || undefined,
    finalizado_em: row.finalizado_em || undefined,
    reaberto_em: row.reaberto_em || undefined,
    fotos_urls: row.fotos_urls || [],
    videos_urls: row.videos_urls || [],
    itens: (row.itens || []).map(item => ({
      id: item.id,
      produto_id: item.produto_id,
      produto_nome: item.produto?.nome || 'Produto removido',
      unidade: item.produto?.unidade || 'un',
      quantidade: Number(item.quantidade || 0),
      observacao: item.observacao || undefined,
      produto: item.produto || undefined,
    })),
  }
}

export type SalvarServicoInput = {
  id?: string
  cliente?: Cliente | null
  clienteNome?: string
  clienteTelefone?: string
  clienteCpf?: string
  clienteEmail?: string
  clienteEndereco?: string
  clienteCidade?: string
  clienteObservacoes?: string
  descricao: string
  observacoes?: string
  fotos_urls?: string[] | null
  videos_urls?: string[] | null
  itens: ServicoItemInput[]
}

export const servicoSvc = {
  async getServicos(limit = 100): Promise<ServicoResumo[]> {
    const { data, error } = await supabase
      .from('servicos')
      .select(`
        *,
        cliente:clientes(*),
        tecnico:profiles(id, nome),
        itens:servico_itens(
          id, produto_id, quantidade, observacao,
          produto:produtos(*)
        )
      `)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data || []).map(row => normalize(row as unknown as ServiceRow))
  },

  async salvarServico(input: SalvarServicoInput): Promise<string> {
    if (!input.itens.length) throw new Error('Adicione pelo menos um produto')

    let clienteId = input.cliente?.id || null
    if (!clienteId && input.clienteNome?.trim()) {
      // A criacao dentro da RPC e atomica. Esta chamada e mantida apenas para
      // clientes ja escolhidos pela interface e compatibilidade offline.
      clienteId = null
    }

    const { data, error } = await supabase.rpc('save_service_with_client_details', {
      p_service_id: input.id || null,
      p_cliente_id: clienteId,
      p_cliente_nome: input.clienteNome?.trim() || null,
      p_cliente_telefone: input.clienteTelefone?.trim() || null,
      p_cliente_cpf: input.clienteCpf?.replace(/\D/g, '') || null,
      p_cliente_email: input.clienteEmail?.trim() || null,
      p_cliente_endereco: input.clienteEndereco?.trim() || null,
      p_cliente_cidade: input.clienteCidade?.trim() || null,
      p_cliente_observacoes: input.clienteObservacoes?.trim() || null,
      p_descricao: input.descricao.trim(),
      p_observacoes: input.observacoes?.trim() || null,
      p_fotos_urls: input.fotos_urls || [],
      p_videos_urls: input.videos_urls || [],
      p_itens: input.itens.map(item => ({
        produto_id: item.produto.id,
        quantidade: Number(item.quantidade),
        observacao: item.observacao?.trim() || null,
      })),
    })
    if (error) throw error
    return data as string
  },

  async finalizarServico(id: string): Promise<void> {
    const { error } = await supabase.rpc('finalize_service', { p_service_id: id })
    if (error) throw error
    await solicitarNotificacao({ type: 'service', serviceId: id })
  },

  async reabrirServico(id: string): Promise<void> {
    const { error } = await supabase.rpc('reopen_service', { p_service_id: id })
    if (error) throw error

    // A reabertura devolve os itens ao estoque dentro da RPC. Reavaliar cada
    // produto garante que uma reposicao que normalize o saldo tambem notifique.
    const { data: itens, error: itensError } = await supabase
      .from('servico_itens')
      .select('produto_id')
      .eq('servico_id', id)
    if (itensError) throw itensError

    const productIds = [...new Set((itens || []).map(item => item.produto_id).filter(Boolean))]
    await Promise.all(productIds.map(productId =>
      solicitarNotificacao({ type: 'stock', productId }),
    ))
  },

  async registrarServico(input: SalvarServicoInput): Promise<string> {
    const id = await this.salvarServico(input)
    await this.finalizarServico(id)
    return `servico:${id}`
  },
}
