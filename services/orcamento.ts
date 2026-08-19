import { supabase } from '../lib/supabase'
import {
  CreateOrcamentoDto,
  Orcamento,
  OrcamentoItem,
  ProdutoComStatus,
  StatusOrcamento,
} from '../types'
import { getEstoqueStatus } from '../utils'

type OrcamentoFilters = {
  status?: StatusOrcamento
  tecnico_id?: string
  limit?: number
}

type ProdutoSearchFilters = {
  search?: string
  limit?: number
}

function toProdutoComStatus(produto: Record<string, unknown>): ProdutoComStatus {
  const quantidade = Number(produto.quantidade ?? 0)
  const estoque_minimo = Number(produto.estoque_minimo ?? 0)

  return {
    ...produto,
    quantidade,
    estoque_minimo,
    status_estoque: getEstoqueStatus({ quantidade, estoque_minimo }),
  } as ProdutoComStatus
}

function calcularItem(item: CreateOrcamentoDto['itens'][number]) {
  const quantidade = Number(item.quantidade || 0)
  const valorUnitario = Number(item.valor_unitario || 0)
  const desconto = Number(item.desconto || 0)
  const bruto = quantidade * valorUnitario
  const total = bruto - (bruto * desconto / 100)

  return {
    quantidade,
    valor_unitario: valorUnitario,
    desconto,
    total,
  }
}

export const orcamentoSvc = {
  async buscarProdutos(filtros?: ProdutoSearchFilters): Promise<ProdutoComStatus[]> {
    let query = supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (filtros?.search) {
      const search = filtros.search.replace(/[%(),]/g, '').trim()
      if (search) {
        query = query.or(`nome.ilike.%${search}%,marca.ilike.%${search}%,modelo.ilike.%${search}%`)
      }
    }

    if (filtros?.limit) query = query.limit(filtros.limit)

    const { data, error } = await query
    if (error) throw error

    return (data || []).map(produto => toProdutoComStatus(produto as Record<string, unknown>))
  },

  async getOrcamentos(filtros?: OrcamentoFilters): Promise<Orcamento[]> {
    let query = supabase
      .from('orcamentos')
      .select(`
        *,
        cliente:clientes(id, nome, telefone, email, endereco, cidade),
        tecnico:profiles(id, nome, email, role),
        itens:orcamento_itens(*)
      `)
      .order('created_at', { ascending: false })

    if (filtros?.status) query = query.eq('status', filtros.status)
    if (filtros?.tecnico_id) query = query.eq('tecnico_id', filtros.tecnico_id)
    if (filtros?.limit) query = query.limit(filtros.limit)

    try {
      const { data, error } = await query
      if (error) throw error
      return (data || []) as Orcamento[]
    } catch (err) {
      console.error('Erro getOrcamentos:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      return []
    }
  },

  async getOrcamento(id: string): Promise<Orcamento> {
    const { data, error } = await supabase
      .from('orcamentos')
      .select(`
        *,
        cliente:clientes(id, nome, telefone, email, endereco, cidade),
        tecnico:profiles(id, nome, email, role),
        itens:orcamento_itens(*, produto:produtos(id, nome, marca, modelo, unidade))
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Orcamento
  },

  async createOrcamento(dto: CreateOrcamentoDto): Promise<Orcamento> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuario nao autenticado')
    if (!dto.itens.length) throw new Error('Adicione pelo menos um item ao orcamento')

    const itensCalculados = dto.itens.map(item => ({
      produto_id: item.produto_id || null,
      nome: item.nome,
      ...calcularItem(item),
    }))

    const subtotal = itensCalculados.reduce((total, item) => total + item.total, 0)
    const mao_de_obra = Number(dto.mao_de_obra || 0)
    const desconto = Number(dto.desconto || 0)
    const totalAntesDesconto = subtotal + mao_de_obra
    const total = totalAntesDesconto - (totalAntesDesconto * desconto / 100)

    const { data: orcamento, error } = await supabase
      .from('orcamentos')
      .insert({
        cliente_id: dto.cliente_id || null,
        cliente_nome: dto.cliente_nome,
        cliente_telefone: dto.cliente_telefone || null,
        cliente_endereco: dto.cliente_endereco || null,
        descricao: dto.descricao,
        validade: dto.validade || null,
        subtotal,
        desconto,
        mao_de_obra,
        total,
        observacoes: dto.observacoes || null,
        tecnico_id: user.id,
      })
      .select('*')
      .single()

    if (error) throw error

    const itensPayload = itensCalculados.map(item => ({
      ...item,
      orcamento_id: orcamento.id,
    }))

    const { error: itensError } = await supabase
      .from('orcamento_itens')
      .insert(itensPayload)

    if (itensError) throw itensError

    return this.getOrcamento(orcamento.id)
  },

  async updateStatus(id: string, status: StatusOrcamento): Promise<void> {
    const extra =
      status === 'aprovado'
        ? { aprovado_em: new Date().toISOString() }
        : status === 'finalizado'
          ? { finalizado_em: new Date().toISOString() }
          : {}

    const { error } = await supabase
      .from('orcamentos')
      .update({ status, ...extra })
      .eq('id', id)

    if (error) throw error
  },

  async duplicarComoBaixa(orcamento: Orcamento): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuario nao autenticado')

    const itensComProduto = (orcamento.itens || []).filter(
      (item): item is OrcamentoItem & { produto_id: string } => Boolean(item.produto_id)
    )

    if (!itensComProduto.length) return

    const { error } = await supabase
      .from('movimentacoes')
      .insert(itensComProduto.map(item => ({
        produto_id: item.produto_id,
        cliente_id: orcamento.cliente_id || null,
        tecnico_id: user.id,
        tipo: 'saida',
        quantidade: item.quantidade,
        observacao: `Baixa do orcamento ${orcamento.numero}`,
        referencia: orcamento.id,
      })))

    if (error) throw error
  },

  // Envia a foto para o armazenamento e retorna sua URL pública.
  async uploadFoto(orcamentoId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop()
    const path = `orcamentos/${orcamentoId}/foto_${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('fotos') // ← troque para o nome do seu bucket se for diferente
      .upload(path, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('fotos').getPublicUrl(path)

    const { error: updateError } = await supabase
      .from('orcamentos')
      .update({ foto_url: data.publicUrl })
      .eq('id', orcamentoId)

    if (updateError) throw updateError

    return data.publicUrl
  },
}
