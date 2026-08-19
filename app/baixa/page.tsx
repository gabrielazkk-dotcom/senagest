'use client'

import { useEffect, useState, useCallback } from 'react'
import { estoqueSvc } from '../../estoque'
import { clienteSvc } from '../../services/cliente'
import { ProdutoComStatus, Cliente, CreateClienteDto } from '../../types'
import { cn, formatQuantidade } from '../../utils'
import {
  ArrowDownCircle, Search, X, User, Package,
  Plus, CheckCircle, AlertTriangle, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adicionarPendenteBaixa } from '../../lib/offlineQueue'
import { pareceErroDeRede } from '../../lib/offlineSync'

interface ItemBaixa {
  produto: ProdutoComStatus
  quantidade: number
  observacao: string
}

export default function BaixaPage() {
  const [step, setStep] = useState<'cliente' | 'produtos' | 'confirm'>('cliente')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<ProdutoComStatus[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaProd, setBuscaProd] = useState('')
  const [itens, setItens] = useState<ItemBaixa[]>([])
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoCliente, setNovoCliente] = useState<CreateClienteDto>({ nome: '', telefone: '' })
  const [saving, setSaving] = useState(false)
  const [showProdSearch, setShowProdSearch] = useState(false)

  const loadClientes = useCallback(async () => {
    const data = await clienteSvc.getClientes(busca)
    setClientes(data)
  }, [busca])

  const loadProdutos = useCallback(async () => {
    const data = await estoqueSvc.getProdutos({ search: buscaProd })
    setProdutos(data)
  }, [buscaProd])

  useEffect(() => { loadClientes() }, [loadClientes])
  useEffect(() => { if (showProdSearch) loadProdutos() }, [showProdSearch, loadProdutos])

  const selecionarProduto = (p: ProdutoComStatus) => {
    if (p.quantidade <= 0) {
      toast.error('Produto sem estoque!')
      return
    }
    const existe = itens.find(i => i.produto.id === p.id)
    if (existe) {
      toast('Produto já adicionado')
      setShowProdSearch(false)
      return
    }
    setItens([...itens, { produto: p, quantidade: 1, observacao: '' }])
    setShowProdSearch(false)
    setBuscaProd('')
  }

  const updateItem = (idx: number, field: 'quantidade' | 'observacao', value: string | number) => {
    const updated = [...itens]
    if (field === 'quantidade') {
      const qty = Number(value)
      const max = updated[idx].produto.quantidade
      if (qty > max) {
        toast.error(`Máximo disponível: ${max}`)
        return
      }
      updated[idx].quantidade = qty
    } else {
      updated[idx].observacao = String(value)
    }
    setItens(updated)
  }

  const removeItem = (idx: number) => {
    setItens(itens.filter((_, i) => i !== idx))
  }

  const criarCliente = async () => {
    if (!novoCliente.nome) { toast.error('Nome obrigatório'); return }
    try {
      const c = await clienteSvc.createCliente(novoCliente)
      setClienteSelecionado(c)
      setShowNovoCliente(false)
      setStep('produtos')
      toast.success('Cliente cadastrado!')
    } catch {
      toast.error('Erro ao cadastrar cliente')
    }
  }

  const confirmarBaixa = async () => {
    if (itens.length === 0) { toast.error('Adicione pelo menos um produto'); return }
    const invalid = itens.find(i => !i.quantidade || i.quantidade <= 0)
    if (invalid) { toast.error('Quantidade inválida em ' + invalid.produto.nome); return }

    const itensPayload = itens.map(item => ({
      produto_id: item.produto.id,
      cliente_id: clienteSelecionado?.id,
      tipo: 'saida' as const,
      quantidade: item.quantidade,
      observacao: item.observacao || `Baixa para ${clienteSelecionado?.nome || 'sem cliente'}`,
    }))

    const salvarOffline = async () => {
      await adicionarPendenteBaixa(itensPayload)
      toast.success(`Sem internet: ${itens.length} item(s) salvos no aparelho e serao enviados quando a conexao voltar.`)
      setItens([])
      setClienteSelecionado(null)
      setStep('cliente')
    }

    setSaving(true)
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await salvarOffline()
        return
      }

      for (const item of itensPayload) {
        await estoqueSvc.darBaixa(item)
      }
      toast.success(`${itens.length} item(s) baixado(s) com sucesso!`)
      setItens([])
      setClienteSelecionado(null)
      setStep('cliente')
    } catch (error) {
      if (pareceErroDeRede(error)) {
        try {
          await salvarOffline()
          return
        } catch (erroOffline) {
          console.error(erroOffline)
          toast.error('Nao foi possivel salvar, nem localmente. Tente novamente.')
          return
        }
      }
      console.error(error)
      toast.error('Erro ao registrar baixa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <ArrowDownCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
        <h1 className="text-lg font-bold flex-1">Dar Baixa</h1>
        {itens.length > 0 && (
          <span className="bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {itens.length}
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex gap-2 items-center bg-surface-950">
        {(['cliente', 'produtos', 'confirm'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all',
              step === s ? 'bg-brand-500 text-white' :
              (['cliente', 'produtos', 'confirm'].indexOf(step) > i) ? 'bg-brand-500/20 text-brand-400' :
              'bg-surface-700 text-surface-400'
            )}>
              {i + 1}
            </div>
            <span className={cn('text-xs', step === s ? 'text-white' : 'text-surface-500')}>
              {s === 'cliente' ? 'Cliente' : s === 'produtos' ? 'Materiais' : 'Confirmar'}
            </span>
            {i < 2 && <div className="w-4 h-0.5 bg-surface-700" />}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {step === 'cliente' && (
          <div className="space-y-4 animate-fade-in">
            <p className="section-title">Selecionar Cliente</p>

            {clienteSelecionado ? (
              <div className="card border-brand-500/30 bg-brand-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5 text-brand-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{clienteSelecionado.nome}</p>
                    {clienteSelecionado.telefone && (
                      <p className="text-sm text-surface-400">{clienteSelecionado.telefone}</p>
                    )}
                  </div>
                  <button onClick={() => setClienteSelecionado(null)} className="text-surface-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={() => setStep('produtos')}
                  className="btn-primary w-full mt-3"
                >
                  Continuar
                  <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="input pl-10"
                    placeholder="Buscar cliente..."
                  />
                </div>

                <div className="space-y-2">
                  {clientes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteSelecionado(c); setStep('produtos') }}
                      className="card w-full text-left flex items-center gap-3 hover:border-brand-500/30 transition-colors active:scale-[0.98]"
                    >
                      <div className="w-9 h-9 bg-surface-700 rounded-xl flex items-center justify-center">
                        <User className="w-4 h-4 text-surface-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{c.nome}</p>
                        {c.telefone && <p className="text-xs text-surface-400">{c.telefone}</p>}
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowNovoCliente(!showNovoCliente)}
                  className="btn-secondary w-full"
                >
                  <Plus className="w-4 h-4" />
                  Novo cliente
                </button>

                {showNovoCliente && (
                  <div className="card space-y-3 animate-slide-up">
                    <p className="font-semibold text-sm">Cadastrar cliente</p>
                    <input
                      value={novoCliente.nome}
                      onChange={e => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                      className="input"
                      placeholder="Nome *"
                    />
                    <input
                      value={novoCliente.telefone}
                      onChange={e => setNovoCliente({ ...novoCliente, telefone: e.target.value })}
                      className="input"
                      placeholder="Telefone"
                      inputMode="tel"
                    />
                    <button onClick={criarCliente} className="btn-primary w-full">
                      <CheckCircle className="w-4 h-4" />
                      Cadastrar e selecionar
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setStep('produtos')}
                  className="text-sm text-surface-400 w-full text-center py-2"
                >
                  Continuar sem cliente
                </button>
              </>
            )}
          </div>
        )}

        {step === 'produtos' && (
          <div className="space-y-4 animate-fade-in">
            {clienteSelecionado && (
              <div className="flex items-center gap-2 text-sm text-surface-400">
                <User className="w-4 h-4" />
                <span>Cliente: <strong className="text-white">{clienteSelecionado.nome}</strong></span>
              </div>
            )}

            <p className="section-title">Materiais Utilizados</p>

            {itens.map((item, idx) => (
              <div key={item.produto.id} className="card space-y-3 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-surface-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-surface-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.produto.nome}</p>
                    <p className="text-xs text-surface-400">Disponível: {formatQuantidade(item.produto.quantidade, item.produto.unidade)}</p>
                  </div>
                  <button onClick={() => removeItem(idx)} className="text-red-400 flex-shrink-0 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">Quantidade</label>
                    <input
                      type="number"
                      value={item.quantidade}
                      onChange={e => updateItem(idx, 'quantidade', e.target.value)}
                      className="input text-center"
                      min={1}
                      max={item.produto.quantidade}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Observação</label>
                    <input
                      value={item.observacao}
                      onChange={e => updateItem(idx, 'observacao', e.target.value)}
                      className="input text-sm"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setShowProdSearch(true)}
              className="btn-secondary w-full"
            >
              <Plus className="w-4 h-4" />
              Adicionar material
            </button>

            {itens.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setStep('cliente')} className="btn-secondary">Voltar</button>
                <button onClick={() => setStep('confirm')} className="btn-primary">Revisar</button>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4 animate-fade-in">
            <p className="section-title">Confirmar Baixa</p>

            <div className="card space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-brand-400" />
                <span className="text-surface-400">Cliente:</span>
                <span className="font-medium">{clienteSelecionado?.nome || 'Sem cliente'}</span>
              </div>
            </div>

            {itens.map(item => (
              <div key={item.produto.id} className="card flex items-center gap-3">
                <div className="w-9 h-9 bg-red-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ArrowDownCircle className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.produto.nome}</p>
                  {item.observacao && <p className="text-xs text-surface-400">{item.observacao}</p>}
                </div>
                <p className="text-red-400 font-bold text-sm flex-shrink-0">-{item.quantidade} {item.produto.unidade}</p>
              </div>
            ))}

            <div className="card bg-red-500/5 border-red-500/20">
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <p>Esta ação reduzirá o estoque imediatamente.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep('produtos')} className="btn-secondary">Voltar</button>
              <button
                onClick={confirmarBaixa}
                disabled={saving}
                className="btn-primary bg-red-500 hover:bg-red-400"
              >
                {saving ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Confirmar</>
                )}
              </button>
            </div>
          </div>
        )}

        {showProdSearch && (
          <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-end">
            <div className="bg-surface-900 w-full rounded-t-3xl overflow-y-auto max-h-[90vh] animate-slide-up">
              <div className="p-4 border-b border-surface-700 flex items-center justify-between sticky top-0 bg-surface-900">
                <h2 className="text-lg font-bold">Selecionar produto</h2>
                <button onClick={() => setShowProdSearch(false)}>
                  <X className="w-6 h-6 text-surface-400" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    value={buscaProd}
                    onChange={e => setBuscaProd(e.target.value)}
                    className="input pl-10"
                    placeholder="Buscar material..."
                  />
                </div>
                <div className="space-y-2">
                  {produtos.map(prod => (
                    <button
                      key={prod.id}
                      onClick={() => selecionarProduto(prod)}
                      className="card w-full text-left flex items-center gap-3 hover:border-brand-500/30 transition-colors"
                    >
                      <div className="w-9 h-9 bg-surface-700 rounded-xl flex items-center justify-center">
                        <Package className="w-4 h-4 text-surface-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{prod.nome}</p>
                        <p className="text-xs text-surface-400">{formatQuantidade(prod.quantidade, prod.unidade)}</p>
                      </div>
                      <ChevronDown className="w-4 h-4 text-surface-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
