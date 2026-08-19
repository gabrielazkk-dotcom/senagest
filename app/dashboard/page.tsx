'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { estoqueSvc } from '../../estoque'
import { orcamentoSvc } from '../../services/orcamento'
import { servicoSvc } from '../../services/servico'
import { formatCurrency, formatDate, getStatusLabel } from '../../utils'
import toast from 'react-hot-toast'
import {
  Package, AlertTriangle, TrendingDown, FileText,
  CheckCircle, Clock, ArrowDownCircle, RefreshCw, BriefcaseBusiness, X, Edit2
} from 'lucide-react'
import type { Movimentacao } from '../../types'

interface Stats {
  total_produtos: number
  produtos_zerados: number
  produtos_baixo: number
  total_orcamentos: number
  orcamentos_pendentes: number
  valor_aberto: number
}

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [ultimas, setUltimas] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const [botoesLoading, setBotoesLoading] = useState(false)

  // Estado dos modais e do formulário de edição.
  const [modalAberto, setModalAberto] = useState(false)
  const [modalEditarAberto, setModalEditarAberto] = useState(false)
  const [movSelecionada, setMovSelecionada] = useState<Movimentacao | null>(null)

  // Campos para o formulário de edição rápidos
  const [editObservacao, setEditObservacao] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [produtosResult, orcamentosResult, movsResult] = await Promise.allSettled([
      estoqueSvc.getProdutos(),
      orcamentoSvc.getOrcamentos(),
      estoqueSvc.getHistorico({ limit: 5 }),
    ])

    const produtos = produtosResult.status === 'fulfilled' ? produtosResult.value : []
    const orcamentos = orcamentosResult.status === 'fulfilled' ? orcamentosResult.value : []
    const movs = movsResult.status === 'fulfilled' ? movsResult.value : []

    if (
      produtosResult.status === 'rejected' ||
      orcamentosResult.status === 'rejected' ||
      movsResult.status === 'rejected'
    ) {
      toast.error('Não foi possível carregar parte dos dados.')
    }

    setStats({
      total_produtos: produtos.length,
      produtos_zerados: produtos.filter(p => p.quantidade <= 0).length,
      produtos_baixo: produtos.filter(p => p.status_estoque === 'baixo').length,
      total_orcamentos: orcamentos.length,
      orcamentos_pendentes: orcamentos.filter(o => o.status === 'pendente').length,
      valor_aberto: orcamentos
        .filter(o => ['pendente', 'aprovado', 'em_execucao'].includes(o.status))
        .reduce((a, b) => a + b.total, 0),
    })
    setUltimas(movs as Movimentacao[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  const abrirModal = (mov: Movimentacao) => {
    setMovSelecionada(mov)
    setModalAberto(true)
  }

  const fecharModal = () => {
    setModalAberto(false)
    setTimeout(() => setMovSelecionada(null), 200)
  }

  const abrirEditar = () => {
    if (!movSelecionada) return
    setEditObservacao(movSelecionada.observacao || '')
    setModalAberto(false) // Fecha o de visualização
    setModalEditarAberto(true) // Abre o de edição
  }

  // Reabre o serviço preservando seu histórico.
  const handleReabrirServico = async () => {
    if (!movSelecionada) return
    
    const referenciaOriginal = movSelecionada.referencia 
    if (!referenciaOriginal) {
      toast.error('Esta movimentação não está vinculada a um serviço.')
      return
    }

    if (!confirm('Deseja reabrir este serviço? O estoque será estornado.')) return

    try {
      setBotoesLoading(true)

      // 1. Ao invés de deletar, nós atualizamos a movimentação para registrar que ela foi estornada
      // Isso devolve o produto ao estoque (via trigger do banco se houver) e mantém o vínculo do serviço ativo na tela
      const serviceId = referenciaOriginal.split(':')[1]
      if (!serviceId) throw new Error('Identificador do servico invalido')
      await servicoSvc.reabrirServico(serviceId)

      toast.success('Serviço reaberto com sucesso!')
      fecharModal()
      loadData()
    } catch (error: any) {
      console.error(error)
      toast.error('Erro ao reabrir serviço: ' + error.message)
    } finally {
      setBotoesLoading(false)
    }
  }

  const handleSalvarEdicao = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!movSelecionada) return

    try {
      setBotoesLoading(true)

      const { error } = await supabase
        .from('movimentacoes')
        .update({
          observacao: editObservacao || null,
        })
        .eq('id', movSelecionada.id)

      if (error) throw error

      toast.success('Movimentação atualizada com sucesso!')
      setModalEditarAberto(false)
      setModalAberto(false)
      loadData()
    } catch (error: any) {
      console.error(error)
      toast.error('Erro ao salvar edição: ' + error.message)
    } finally {
      setBotoesLoading(false)
    }
  }

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-20 animate-pulse bg-surface-800" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6 animate-fade-in relative">
      <div>
        <p className="text-surface-400 text-sm">{saudacao},</p>
        <h1 className="text-xl font-bold text-white">{profile?.nome?.split(' ')[0]} 👋</h1>
      </div>

      {/* Alertas de Estoque */}
      {(stats && (stats.produtos_zerados > 0 || stats.produtos_baixo > 0)) && (
        <div className="card border-yellow-500/20 bg-yellow-500/5 space-y-2">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold text-sm">Alertas de Estoque</span>
          </div>
          {stats.produtos_zerados > 0 && (
            <Link href="/estoque?status=zerado" className="flex items-center gap-2 text-red-400 text-sm">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              {stats.produtos_zerados} produto(s) zerado(s)
            </Link>
          )}
          {stats.produtos_baixo > 0 && (
            <Link href="/estoque?status=baixo" className="flex items-center gap-2 text-yellow-400 text-sm">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              {stats.produtos_baixo} produto(s) abaixo do mínimo
            </Link>
          )}
        </div>
      )}

      {/* Grid de Estatísticas */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/estoque" className="stat-card hover:border-brand-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <Package className="w-5 h-5 text-brand-400" />
            <span className="text-2xl font-bold text-white">{stats?.total_produtos}</span>
          </div>
          <p className="text-surface-400 text-sm">Produtos</p>
        </Link>

        <Link href="/estoque?status=zerado" className="stat-card hover:border-red-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <span className="text-2xl font-bold text-red-400">{stats?.produtos_zerados}</span>
          </div>
          <p className="text-surface-400 text-sm">Em falta</p>
        </Link>

        <Link href="/orcamento" className="stat-card hover:border-brand-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <FileText className="w-5 h-5 text-blue-400" />
            <span className="text-2xl font-bold text-white">{stats?.total_orcamentos}</span>
          </div>
          <p className="text-surface-400 text-sm">Orçamentos</p>
        </Link>

        <Link href="/orcamento?status=pendente" className="stat-card hover:border-yellow-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <Clock className="w-5 h-5 text-yellow-400" />
            <span className="text-2xl font-bold text-yellow-400">{stats?.orcamentos_pendentes}</span>
          </div>
          <p className="text-surface-400 text-sm">Pendentes</p>
        </Link>
      </div>

      {isAdmin && (
        <div className="card bg-brand-500/5 border-brand-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-surface-400 text-sm">Valor em Aberto</p>
              <p className="text-2xl font-bold text-brand-400">{formatCurrency(stats?.valor_aberto || 0)}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-brand-500/50" />
          </div>
        </div>
      )}

      {/* Ações Rápidas */}
      <div>
        <p className="section-title">Ações Rápidas</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/servicos" className="btn-primary text-sm py-4 flex-col gap-1 h-auto">
            <BriefcaseBusiness className="w-5 h-5" />
            <span>Novo Servico</span>
          </Link>
          <Link href="/orcamento/novo" className="btn-secondary text-sm py-4 flex-col gap-1 h-auto">
            <FileText className="w-5 h-5" />
            <span>Novo Orçamento</span>
          </Link>
        </div>
      </div>

      {/* Últimas Movimentações */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-title mb-0">Últimas Movimentações</p>
          <Link href="/historico" className="text-brand-400 text-xs">Ver tudo</Link>
        </div>
        <div className="space-y-2">
          {ultimas.length === 0 ? (
            <div className="card text-center text-surface-500 py-6">
              Nenhuma movimentação ainda
            </div>
          ) : (
            ultimas.map((mov: Movimentacao) => (
              <div 
                key={mov.id} 
                onClick={() => abrirModal(mov)}
                className="card flex items-center gap-3 py-3 cursor-pointer hover:border-brand-500/30 transition-colors"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  mov.tipo === 'saida' ? 'bg-red-500/10' : 'bg-green-500/10'
                }`}>
                  <ArrowDownCircle className={`w-4 h-4 ${
                    mov.tipo === 'saida' ? 'text-red-400 rotate-0' : 'text-green-400 rotate-180'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {(mov as unknown as { produto: { nome: string } }).produto?.nome}
                  </p>
                  <p className="text-xs text-surface-400 truncate">
                    {getStatusLabel(mov.tipo)} • {(mov as unknown as { cliente: { nome: string } }).cliente?.nome || 'Sem cliente'} • {(mov as unknown as { tecnico: { nome: string } }).tecnico?.nome}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${mov.tipo === 'saida' ? 'text-red-400' : 'text-green-400'}`}>
                    {mov.tipo === 'saida' ? '-' : '+'}{mov.quantidade}
                  </p>
                  <p className="text-xs text-surface-500">{formatDate(mov.created_at).split(' às')[0]}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <button onClick={loadData} className="w-full btn-secondary text-sm">
        <RefreshCw className="w-4 h-4" />
        Atualizar
      </button>

      {/* --- MODAL 1: VISUALIZAÇÃO DE DETALHES --- */}
      {modalAberto && movSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-surface-900 border border-surface-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-surface-800 bg-surface-950">
              <h2 className="text-lg font-bold text-white">Detalhes do Serviço</h2>
              <button onClick={fecharModal} className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Produto</p>
                <p className="text-base text-white">{(movSelecionada as any).produto?.nome || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-base text-white">{(movSelecionada as any).cliente?.nome || 'Sem cliente'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Técnico</p>
                  <p className="text-base text-white">{(movSelecionada as any).tecnico?.nome || 'Não informado'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Data</p>
                  <p className="text-base text-white">{formatDate(movSelecionada.created_at)}</p>
                </div>
              </div>
              <div className="bg-surface-950 p-3 rounded-xl border border-surface-800">
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Observações da Movimentação</p>
                <p className="text-sm text-surface-200">{movSelecionada.observacao || 'Nenhuma observação informada.'}</p>
              </div>
            </div>

            <div className="p-4 border-t border-surface-800 bg-surface-950 flex gap-2 justify-end">
              <button onClick={fecharModal} className="btn-secondary text-sm">Fechar</button>
              <button onClick={abrirEditar} className="btn-primary text-sm flex items-center gap-1"><Edit2 className="w-3.5 h-3.5" /> Editar</button>
              {movSelecionada.referencia && (
                <button 
                  onClick={handleReabrirServico} 
                  disabled={botoesLoading}
                  className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/20 disabled:opacity-50 rounded-xl px-4 py-2 font-medium text-sm transition-colors"
                >
                  {botoesLoading ? 'Processando...' : 'Reabrir'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: FORMULÁRIO DE EDIÇÃO (OPÇÃO B) --- */}
      {modalEditarAberto && movSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleSalvarEdicao} className="w-full max-w-lg rounded-2xl bg-surface-900 border border-surface-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-surface-800 bg-surface-950">
              <h2 className="text-lg font-bold text-white">Editar Movimentação</h2>
              <button type="button" onClick={() => setModalEditarAberto(false)} className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-surface-400">Alterando dados do item: <span className="text-white font-medium">{(movSelecionada as any).produto?.nome}</span></p>
              
              <div>
                <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Observações</label>
                <textarea 
                  rows={3}
                  value={editObservacao}
                  onChange={(e) => setEditObservacao(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 transition-colors text-sm resize-none"
                  placeholder="Escreva aqui os detalhes da alteração..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-surface-800 bg-surface-950 flex gap-2 justify-end">
              <button type="button" onClick={() => { setModalEditarAberto(false); setModalAberto(true); }} className="btn-secondary text-sm">Voltar</button>
              <button type="submit" disabled={botoesLoading} className="btn-primary text-sm px-6">
                {botoesLoading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}
