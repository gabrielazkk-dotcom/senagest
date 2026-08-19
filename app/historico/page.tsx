'use client'

import { useEffect, useState, useCallback } from 'react'
import { estoqueSvc } from '../../estoque'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, cn } from '../../utils'
import { History, X, ArrowDownCircle, ArrowUpCircle, Filter, Settings2 } from 'lucide-react'
import type { Movimentacao } from '../../types'

type TecnicoResumo = { id: string; nome: string }

type MovComRelacoes = Movimentacao & {
  produto: { nome: string; unidade: string }
  cliente?: { nome: string }
  tecnico: { nome: string }
}

export default function HistoricoPage() {
  const { isAdmin, profile } = useAuth()
  const [movs, setMovs] = useState<MovComRelacoes[]>([])
  const [loading, setLoading] = useState(true)
  const [tecnicos, setTecnicos] = useState<TecnicoResumo[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const [filtros, setFiltros] = useState({
    tipo: '',
    cliente_id: '',
    tecnico_id: '',
    from: '',
    to: '',
  })

  const loadMovs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await estoqueSvc.getHistorico({
        tipo: filtros.tipo || undefined,
        cliente_id: filtros.cliente_id || undefined,
        tecnico_id: filtros.tecnico_id || (!isAdmin ? profile?.id : undefined),
        from: filtros.from || undefined,
        to: filtros.to || undefined,
      })
      setMovs(data as MovComRelacoes[])
    } finally {
      setLoading(false)
    }
  }, [filtros, isAdmin, profile?.id])

  useEffect(() => {
    loadMovs()
    if (isAdmin) {
      supabase.from('profiles').select('id,nome').then(({ data }) => setTecnicos(data || []))
    }
  }, [loadMovs, isAdmin])

  useEffect(() => {
    const ch = supabase.channel('historico_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimentacoes' }, loadMovs)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadMovs])

  const tipoIcon = (tipo: string) => {
    if (tipo === 'entrada') return <ArrowUpCircle className="w-4 h-4 text-green-400" />
    if (tipo === 'saida') return <ArrowDownCircle className="w-4 h-4 text-red-400" />
    return <Settings2 className="w-4 h-4 text-blue-400" />
  }

  const tipoColor = (tipo: string) => {
    if (tipo === 'entrada') return 'text-green-400'
    if (tipo === 'saida') return 'text-red-400'
    return 'text-blue-400'
  }

  const temFiltro = Object.values(filtros).some(v => v)

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <History className="w-5 h-5 text-brand-400 flex-shrink-0" />
        <h1 className="text-lg font-bold flex-1">Histórico</h1>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'p-2 rounded-xl transition-all',
            temFiltro ? 'bg-brand-500/10 text-brand-400' : 'text-surface-400'
          )}
        >
          <Filter className="w-5 h-5" />
        </button>
      </div>

      {showFilters && (
        <div className="px-4 py-3 bg-surface-900 border-b border-surface-800 space-y-3 animate-slide-up">
          <div className="grid grid-cols-3 gap-2">
            {(['', 'saida', 'entrada'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFiltros({ ...filtros, tipo: t })}
                className={cn(
                  'py-2 px-3 rounded-xl text-sm font-medium transition-all',
                  filtros.tipo === t ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' : 'bg-surface-700 text-surface-300'
                )}
              >
                {t === '' ? 'Todos' : t === 'saida' ? 'Saídas' : 'Entradas'}
              </button>
            ))}
          </div>

          {isAdmin && (
            <select value={filtros.tecnico_id} onChange={e => setFiltros({ ...filtros, tecnico_id: e.target.value })} className="input text-sm">
              <option value="">Todos os técnicos</option>
              {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">De</label>
              <input type="date" value={filtros.from} onChange={e => setFiltros({ ...filtros, from: e.target.value })} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Até</label>
              <input type="date" value={filtros.to} onChange={e => setFiltros({ ...filtros, to: e.target.value })} className="input text-sm" />
            </div>
          </div>

          {temFiltro && (
            <button
              onClick={() => setFiltros({ tipo: '', cliente_id: '', tecnico_id: '', from: '', to: '' })}
              className="btn-secondary w-full text-sm py-2"
            >
              <X className="w-4 h-4" />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="card h-16 animate-pulse" />
          ))
        ) : movs.length === 0 ? (
          <div className="card text-center py-12">
            <History className="w-10 h-10 text-surface-600 mx-auto mb-2" />
            <p className="text-surface-400">Nenhuma movimentação encontrada</p>
          </div>
        ) : (
          movs.map(mov => (
            <div key={mov.id} className="card flex items-center gap-3">
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                mov.tipo === 'entrada' ? 'bg-green-500/10' :
                mov.tipo === 'saida' ? 'bg-red-500/10' : 'bg-blue-500/10'
              )}>
                {tipoIcon(mov.tipo)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate text-white">{mov.produto?.nome}</p>
                <p className="text-xs text-surface-400 truncate">
                  {mov.cliente?.nome && `${mov.cliente.nome} • `}
                  {mov.tecnico?.nome}
                </p>
                {mov.observacao && (
                  <p className="text-xs text-surface-500 truncate italic">{mov.observacao}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={cn('font-bold text-sm', tipoColor(mov.tipo))}>
                  {mov.tipo === 'saida' ? '-' : '+'}{mov.quantidade} {mov.produto?.unidade}
                </p>
                <p className="text-xs text-surface-500">{formatDate(mov.created_at).split(' às')[0]}</p>
                <p className="text-xs text-surface-600">{formatDate(mov.created_at).split('às ')[1]}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
