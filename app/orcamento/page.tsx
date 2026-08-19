'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { orcamentoSvc } from '../../services/orcamento'
import { supabase } from '../../lib/supabase'
import { Orcamento, StatusOrcamento } from '../../types'
import { formatCurrency, formatDate, getStatusColor, getStatusLabel, generateOrcamentoNumber, cn } from '../../utils'
import { FileText, Plus, ChevronRight } from 'lucide-react'

const STATUS_TABS: { value: StatusOrcamento | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'em_execucao', label: 'Em Execução' },
  { value: 'finalizado', label: 'Finalizado' },
]

function OrcamentoContent() {
  const searchParams = useSearchParams()
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusOrcamento | 'todos'>(
    (searchParams.get('status') as StatusOrcamento) || 'todos'
  )

  const loadOrcamentos = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orcamentoSvc.getOrcamentos({
        status: status !== 'todos' ? status : undefined,
      })
      setOrcamentos(data)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { loadOrcamentos() }, [loadOrcamentos])

  useEffect(() => {
    const ch = supabase.channel('orcamentos_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, loadOrcamentos)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadOrcamentos])

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <FileText className="w-5 h-5 text-brand-400 flex-shrink-0" />
        <h1 className="text-lg font-bold flex-1">Orçamentos</h1>
        <Link href="/orcamento/novo" className="btn-primary py-2 px-3 text-sm">
          <Plus className="w-4 h-4" />
          Novo
        </Link>
      </div>

      <div className="px-4 py-2 flex gap-2 overflow-x-auto bg-surface-950 border-b border-surface-800">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              status === tab.value
                ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                : 'text-surface-400 hover:text-surface-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))
        ) : orcamentos.length === 0 ? (
          <div className="card text-center py-12">
            <FileText className="w-10 h-10 text-surface-600 mx-auto mb-2" />
            <p className="text-surface-400">Nenhum orçamento encontrado</p>
            <Link href="/orcamento/novo" className="btn-primary mt-4 text-sm inline-flex">
              <Plus className="w-4 h-4" />
              Criar orçamento
            </Link>
          </div>
        ) : (
          orcamentos.map(orc => (
            <Link
              key={orc.id}
              href={`/orcamento/${orc.id}`}
              className="card block hover:border-brand-500/30 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-surface-500">
                      {generateOrcamentoNumber(orc.numero)}
                    </span>
                    <span className={cn('badge', getStatusColor(orc.status))}>
                      {getStatusLabel(orc.status)}
                    </span>
                  </div>
                  <p className="font-semibold text-white truncate">{orc.cliente_nome}</p>
                  <p className="text-sm text-surface-400 truncate">{orc.descricao}</p>
                  <p className="text-xs text-surface-500 mt-1">{formatDate(orc.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-brand-400">{formatCurrency(orc.total)}</p>
                    <p className="text-xs text-surface-500">{(orc.itens || []).length} item(s)</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

export default function OrcamentoPage() {
  return (
    <Suspense fallback={<div className="p-4">Carregando...</div>}>
      <OrcamentoContent />
    </Suspense>
  )
}
