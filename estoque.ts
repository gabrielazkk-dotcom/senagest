import { supabase } from './lib/supabase'
import { Produto, Categoria, CreateProdutoDto, CreateMovimentacaoDto, ProdutoComStatus } from './types'
import { getEstoqueStatus } from './utils'
import { offlineData } from './lib/offlineData'
import { solicitarNotificacao } from './lib/notifications'

export const estoqueSvc = {
  async getCategorias(): Promise<Categoria[]> {
    try {
      const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('nome')
      if (error) throw error
      return data
    } catch (err) {
      console.error('Erro getCategorias:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      return []
    }
  },

  async getProdutos(filtros?: {
    search?: string
    categoria_id?: string
    status?: 'ok' | 'baixo' | 'zerado' | 'todos'
  }): Promise<ProdutoComStatus[]> {
    // FIX: include categoria join so components can access p.categoria.nome
    let query = supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (filtros?.search) {
      query = query.ilike('nome', `%${filtros.search}%`)
    }
    if (filtros?.categoria_id) {
      query = query.eq('categoria_id', filtros.categoria_id)
    }

    try {
      const { data, error } = await query
      if (error) throw error

      const normalize = (p: Record<string, unknown>) => {
        const quantidade = Number(
          p.quantidade ?? p.qtd ?? p.estoque ?? p.quantidade_estoque ??
          p.quantidade_total ?? p.qnt ?? p.stock ?? p.quantidade_atual ?? 0
        )
        const estoque_minimo = Number(p.estoque_minimo ?? p.minimo ?? p.estoqueMinimo ?? 0)
        return { ...p, quantidade, estoque_minimo }
      }

      const produtos = (data as Record<string, unknown>[]).map(p => {
        const np = normalize(p)
        return {
          ...np,
          status_estoque: getEstoqueStatus(np as { quantidade: number; estoque_minimo: number }),
        }
      })

      if (filtros?.status && filtros.status !== 'todos') {
        return produtos.filter(p => p.status_estoque === filtros.status) as ProdutoComStatus[]
      }

      const resultado = produtos as ProdutoComStatus[]
      await offlineData.setProdutos(resultado, !filtros?.search && !filtros?.categoria_id)
      return resultado
    } catch (err) {
      console.error('Erro getProdutos:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      const cache = await offlineData.getProdutos()
      if (!cache) return []

      let produtos = cache
      if (filtros?.search) {
        const termo = filtros.search.toLocaleLowerCase('pt-BR')
        produtos = produtos.filter(produto => produto.nome.toLocaleLowerCase('pt-BR').includes(termo))
      }
      if (filtros?.categoria_id) {
        produtos = produtos.filter(produto => produto.categoria_id === filtros.categoria_id)
      }
      if (filtros?.status && filtros.status !== 'todos') {
        produtos = produtos.filter(produto => produto.status_estoque === filtros.status)
      }
      return produtos
    }
  },

  async getProduto(id: string): Promise<Produto> {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async createProduto(dto: CreateProdutoDto): Promise<Produto> {
    const { data, error } = await supabase
      .from('produtos')
      // A tabela antiga em producao nao possuia default para `ativo`.
      // Enviar explicitamente evita que o produto seja salvo como NULL e
      // desapareca da consulta, que exibe apenas registros ativos.
      .insert({ ...dto, ativo: true })
      .select('*')
      .single()
    if (error) throw error
    await solicitarNotificacao({ type: 'stock', productId: data.id })
    return data
  },

  async updateProduto(id: string, dto: Partial<CreateProdutoDto>): Promise<Produto> {
    const { data, error } = await supabase
      .from('produtos')
      .update(dto)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    await solicitarNotificacao({ type: 'stock', productId: data.id })
    return data
  },

  async ajustarEstoque(id: string, delta: number, motivo: string): Promise<number> {
    if (!Number.isFinite(delta) || delta === 0) throw new Error('Informe uma quantidade diferente de zero')
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_product_id: id,
      p_delta: delta,
      p_reason: motivo.trim() || (delta > 0 ? 'Entrada manual de estoque' : 'Saida manual de estoque'),
    })
    if (error) throw error
    await solicitarNotificacao({ type: 'stock', productId: id })
    return Number(data)
  },

  async deleteProduto(id: string): Promise<void> {
    const { error } = await supabase
      .from('produtos')
      .update({ ativo: false })
      .eq('id', id)
    if (error) throw error
  },

  async darBaixa(dto: CreateMovimentacaoDto): Promise<void> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error('Usuário não autenticado')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) throw new Error('Perfil de técnico não encontrado. Verifique se sua conta está corretamente registrada.')

    const { error } = await supabase
      .from('movimentacoes')
      .insert({ ...dto, tecnico_id: profile.id })
    if (error) throw error
    await solicitarNotificacao({ type: 'stock', productId: dto.produto_id })
  },

  async addEstoque(dto: CreateMovimentacaoDto): Promise<void> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error('Usuário não autenticado')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) throw new Error('Perfil de técnico não encontrado. Verifique se sua conta está corretamente registrada.')

    const { error } = await supabase
      .from('movimentacoes')
      .insert({ ...dto, tipo: 'entrada', tecnico_id: profile.id })
    if (error) throw error
    await solicitarNotificacao({ type: 'stock', productId: dto.produto_id })
  },

  async getProdutosAbaixoMinimo(): Promise<ProdutoComStatus[]> {
    try {
      const todos = await this.getProdutos()
      return todos.filter(p => p.status_estoque !== 'ok')
    } catch (err) {
      console.error('Erro getProdutosAbaixoMinimo:', err)
      return []
    }
  },

  async getHistorico(filtros?: {
    produto_id?: string
    cliente_id?: string
    tecnico_id?: string
    tipo?: string
    from?: string
    to?: string
    limit?: number
  }) {
    let query = supabase
      .from('movimentacoes')
      .select(`
        *,
        produto:produtos(id, nome, unidade),
        cliente:clientes(id, nome),
        tecnico:profiles(id, nome)
      `)
      .order('created_at', { ascending: false })

    if (filtros?.produto_id)  query = query.eq('produto_id', filtros.produto_id)
    if (filtros?.cliente_id)  query = query.eq('cliente_id', filtros.cliente_id)
    if (filtros?.tecnico_id)  query = query.eq('tecnico_id', filtros.tecnico_id)
    if (filtros?.tipo)        query = query.eq('tipo', filtros.tipo)
    if (filtros?.from)        query = query.gte('created_at', filtros.from)
    if (filtros?.to)          query = query.lte('created_at', filtros.to)
    if (filtros?.limit)       query = query.limit(filtros.limit)

    try {
      const { data, error } = await query
      if (error) throw error
      return data
    } catch (err) {
      console.error('Erro getHistorico:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      return []
    }
  },
}
