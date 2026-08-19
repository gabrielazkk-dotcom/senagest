import { supabase } from '../lib/supabase'
import type { ProductUsageDashboard } from '../types'

const emptyDashboard: ProductUsageDashboard = {
  resumo: { produtos: 0, registros: 0, servicos: 0, clientes: 0 },
  produtos: [],
}

export const relatorioSvc = {
  async produtosMaisUtilizados(days: number | null): Promise<ProductUsageDashboard> {
    const from = days == null
      ? null
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase.rpc('product_usage_dashboard', {
      p_from: from,
      p_to: new Date().toISOString(),
    })
    if (error) throw error
    if (!data || typeof data !== 'object') return emptyDashboard

    const result = data as unknown as ProductUsageDashboard
    return {
      resumo: {
        produtos: Number(result.resumo?.produtos || 0),
        registros: Number(result.resumo?.registros || 0),
        servicos: Number(result.resumo?.servicos || 0),
        clientes: Number(result.resumo?.clientes || 0),
      },
      produtos: (result.produtos || []).map(item => ({
        ...item,
        quantidade_atual: Number(item.quantidade_atual || 0),
        estoque_minimo: Number(item.estoque_minimo || 0),
        total_utilizado: Number(item.total_utilizado || 0),
        registros: Number(item.registros || 0),
        servicos: Number(item.servicos || 0),
        clientes: Number(item.clientes || 0),
      })),
    }
  },
}
