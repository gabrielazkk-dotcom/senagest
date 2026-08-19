'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, BarChart3, BriefcaseBusiness, Download, Package, RefreshCw, Search, Trophy, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { relatorioSvc } from '../../../services/relatorio'
import type { ProductUsageDashboard, ProductUsageRow } from '../../../types'
import { cn, formatDateShort, formatQuantidade } from '../../../utils'

type Period = '7' | '30' | '90' | '365' | 'all'

const periods: Array<{ value: Period; label: string }> = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '365', label: '1 ano' },
  { value: 'all', label: 'Todo periodo' },
]

const emptyDashboard: ProductUsageDashboard = {
  resumo: { produtos: 0, registros: 0, servicos: 0, clientes: 0 },
  produtos: [],
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function stockStatus(product: ProductUsageRow) {
  if (product.quantidade_atual <= 0) return { label: 'Zerado', className: 'text-red-400 bg-red-500/10 border-red-500/20' }
  if (product.quantidade_atual <= product.estoque_minimo) return { label: 'Baixo', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
  return { label: 'Normal', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
}

export default function ProdutosMaisUtilizadosPage() {
  const [period, setPeriod] = useState<Period>('30')
  const [dashboard, setDashboard] = useState<ProductUsageDashboard>(emptyDashboard)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (selectedPeriod: Period) => {
    setLoading(true)
    try {
      setDashboard(await relatorioSvc.produtosMaisUtilizados(selectedPeriod === 'all' ? null : Number(selectedPeriod)))
    } catch (error) {
      console.error(error)
      toast.error('Nao foi possivel carregar o relatorio.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [load, period])

  const categories = useMemo(() => [...new Set(dashboard.produtos.map(product => product.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [dashboard.produtos])

  const products = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    return dashboard.produtos.filter(product =>
      (!term || `${product.nome} ${product.categoria || ''}`.toLocaleLowerCase('pt-BR').includes(term)) &&
      (!category || product.categoria === category),
    )
  }, [dashboard.produtos, query, category])

  const maximum = Math.max(...products.map(product => product.total_utilizado), 1)
  const topProducts = products.slice(0, 3)

  const exportCsv = () => {
    if (!products.length) return toast.error('Nao ha dados para exportar.')
    const header = ['Posicao', 'Produto', 'Categoria', 'Quantidade utilizada', 'Unidade', 'Servicos', 'Clientes', 'Estoque atual', 'Ultimo uso']
    const rows = products.map((product, index) => [
      index + 1, product.nome, product.categoria || 'Sem categoria', product.total_utilizado,
      product.unidade, product.servicos, product.clientes, product.quantidade_atual,
      product.ultimo_uso ? formatDateShort(product.ultimo_uso) : '',
    ])
    const csv = [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `produtos-mais-utilizados-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="animate-fade-in">
    <div className="page-header">
      <BarChart3 className="h-5 w-5 text-brand-400" />
      <div className="flex-1"><h1 className="text-lg font-bold">Produtos mais utilizados</h1><p className="text-[10px] text-surface-500">Consumo real por servicos e saidas manuais</p></div>
      <button onClick={exportCsv} className="btn-secondary min-h-0 px-3 py-2 text-xs"><Download className="h-4 w-4" />CSV</button>
    </div>

    <div className="space-y-5 p-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {periods.map(item => <button key={item.value} onClick={() => setPeriod(item.value)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-medium', period === item.value ? 'bg-brand-500 text-white' : 'bg-surface-900 text-surface-400')}>{item.label}</button>)}
      </div>

      <section className="grid grid-cols-2 gap-3">
        <div className="stat-card"><Package className="h-5 w-5 text-brand-400" /><strong className="text-2xl">{dashboard.resumo.produtos}</strong><span className="text-xs text-surface-400">Produtos utilizados</span></div>
        <div className="stat-card"><Activity className="h-5 w-5 text-cyan-400" /><strong className="text-2xl">{dashboard.resumo.registros}</strong><span className="text-xs text-surface-400">Registros de consumo</span></div>
        <div className="stat-card"><BriefcaseBusiness className="h-5 w-5 text-emerald-400" /><strong className="text-2xl">{dashboard.resumo.servicos}</strong><span className="text-xs text-surface-400">Servicos finalizados</span></div>
        <div className="stat-card"><Users className="h-5 w-5 text-violet-400" /><strong className="text-2xl">{dashboard.resumo.clientes}</strong><span className="text-xs text-surface-400">Clientes atendidos</span></div>
      </section>

      {loading ? <div className="grid grid-cols-3 gap-2">{[0,1,2].map(item => <div key={item} className="card h-32 animate-pulse" />)}</div> : topProducts.length > 0 && <section>
        <p className="section-title">Destaques do periodo</p>
        <div className="grid grid-cols-3 gap-2">
          {topProducts.map((product,index) => <div key={product.produto_id} className={cn('card min-w-0 p-3 text-center', index === 0 && 'border-amber-400/30 bg-amber-500/5')}>
            <div className={cn('mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold', index === 0 ? 'bg-amber-400 text-black' : index === 1 ? 'bg-surface-300 text-surface-950' : 'bg-orange-700 text-white')}>{index + 1}</div>
            {index === 0 && <Trophy className="mx-auto mb-1 h-4 w-4 text-amber-400" />}
            <p className="truncate text-xs font-semibold" title={product.nome}>{product.nome}</p>
            <p className="mt-1 text-sm font-bold text-brand-300">{formatQuantidade(product.total_utilizado, product.unidade)}</p>
          </div>)}
        </div>
      </section>}

      <section className="card space-y-3">
        <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-surface-500" /><input className="input pl-10" placeholder="Buscar produto ou categoria" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <select className="input" value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas as categorias</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><p className="section-title mb-0">Ranking completo</p><span className="text-xs text-surface-500">{products.length} produto(s)</span></div>
        {loading ? <div className="card h-40 animate-pulse" /> : products.length === 0 ? <div className="card py-10 text-center text-surface-400">Nenhum consumo encontrado neste periodo.</div> : <div className="space-y-3">
          {products.map((product,index) => {
            const status = stockStatus(product)
            const percentage = Math.max(3, (product.total_utilizado / maximum) * 100)
            return <article key={product.produto_id} className="card space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-sm font-bold text-brand-300">{index + 1}</div>
                <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{product.nome}</h2><p className="text-xs text-surface-500">{product.categoria || 'Sem categoria'}{product.ultimo_uso ? ` · ultimo uso ${formatDateShort(product.ultimo_uso)}` : ''}</p></div>
                <div className="text-right"><p className="font-bold text-brand-300">{formatQuantidade(product.total_utilizado, product.unidade)}</p><p className="text-[10px] text-surface-500">utilizados</p></div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-950"><div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${percentage}%` }} /></div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-surface-400">
                <span>{product.servicos} servico(s)</span><span>·</span><span>{product.clientes} cliente(s)</span><span>·</span><span>{product.registros} registro(s)</span>
                <span className={cn('ml-auto rounded-full border px-2 py-1', status.className)}>{status.label}: {formatQuantidade(product.quantidade_atual, product.unidade)}</span>
              </div>
              {product.quantidade_atual <= product.estoque_minimo && <div className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />Consumo alto com estoque no minimo. Considere repor.</div>}
            </article>
          })}
        </div>}
      </section>

      <button onClick={() => load(period)} disabled={loading} className="btn-secondary w-full text-sm"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />Atualizar relatorio</button>
    </div>
  </div>
}
