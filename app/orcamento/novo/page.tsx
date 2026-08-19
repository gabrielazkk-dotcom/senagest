'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, FileText, Package, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { orcamentoSvc } from '../../../services/orcamento'
import { ProdutoComStatus } from '../../../types'
import { formatCurrency, formatQuantidade } from '../../../utils'
import { adicionarPendenteOrcamento } from '../../../lib/offlineQueue'
import { pareceErroDeRede } from '../../../lib/offlineSync'

type ItemForm = {
  produto_id?: string
  nome: string
  quantidade: number
  valor_unitario: number
  desconto: number
}

// Evita que o botão "Salvando..." fique travado pra sempre quando a sessão
// expirou e a validação com o servidor não responde. Depois desse tempo,
// mostramos um erro claro pedindo pra recarregar em vez de ficar parado.
function comTimeout<T>(promessa: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT_SALVAR')), ms)
    ),
  ])
}

function itemTotal(item: ItemForm) {
  const bruto = Number(item.quantidade || 0) * Number(item.valor_unitario || 0)
  return bruto - (bruto * Number(item.desconto || 0) / 100)
}

export default function NovoOrcamentoPage() {
  const router = useRouter()
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteEndereco, setClienteEndereco] = useState('')
  const [descricao, setDescricao] = useState('')
  const [validade, setValidade] = useState('')
  const [maoDeObra, setMaoDeObra] = useState(0)
  const [desconto, setDesconto] = useState(0)
  const [observacoes, setObservacoes] = useState('')
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ProdutoComStatus[]>([])
  const [itens, setItens] = useState<ItemForm[]>([])
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Foto anexada ao orçamento.
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  const subtotal = useMemo(() => itens.reduce((total, item) => total + itemTotal(item), 0), [itens])
  const totalAntesDesconto = subtotal + Number(maoDeObra || 0)
  const total = totalAntesDesconto - (totalAntesDesconto * Number(desconto || 0) / 100)

  const buscarProdutos = async (texto: string) => {
    setBusca(texto)

    if (texto.trim().length < 2) {
      setResultados([])
      return
    }

    setBuscando(true)
    try {
      const data = await orcamentoSvc.buscarProdutos({ search: texto, limit: 8 })
      setResultados(data)
    } catch {
      toast.error('Erro ao buscar produtos')
    } finally {
      setBuscando(false)
    }
  }

  const adicionarProduto = (produto: ProdutoComStatus) => {
    const existente = itens.find(item => item.produto_id === produto.id)

    if (existente) {
      setItens(prev => prev.map(item =>
        item.produto_id === produto.id
          ? { ...item, quantidade: item.quantidade + 1 }
          : item
      ))
    } else {
      setItens(prev => [...prev, {
        produto_id: produto.id,
        nome: [produto.nome, produto.marca, produto.modelo].filter(Boolean).join(' - '),
        quantidade: 1,
        valor_unitario: 0,
        desconto: 0,
      }])
    }

    setBusca('')
    setResultados([])
  }

  const adicionarItemLivre = () => {
    setItens(prev => [...prev, {
      nome: 'Servico ou material avulso',
      quantidade: 1,
      valor_unitario: 0,
      desconto: 0,
    }])
  }

  const atualizarItem = (index: number, patch: Partial<ItemForm>) => {
    setItens(prev => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item))
  }

  const removerItem = (index: number) => {
    setItens(prev => prev.filter((_, idx) => idx !== index))
  }

  // Prepara a foto selecionada para visualização e envio.
  const handleFotoSelecionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  const removerFoto = () => {
    setFotoFile(null)
    setFotoPreview(null)
    if (inputFotoRef.current) inputFotoRef.current.value = ''
  }

  const salvarOrcamento = async () => {
    if (!clienteNome.trim()) {
      toast.error('Informe o cliente')
      return
    }
    if (!descricao.trim()) {
      toast.error('Informe a descricao do servico')
      return
    }
    if (!itens.length) {
      toast.error('Adicione pelo menos um item')
      return
    }
    if (itens.some(item => !item.nome.trim() || item.quantidade <= 0 || item.valor_unitario < 0)) {
      toast.error('Revise os itens do orcamento')
      return
    }

    const dto = {
      cliente_nome: clienteNome.trim(),
      cliente_telefone: clienteTelefone.trim() || undefined,
      cliente_endereco: clienteEndereco.trim() || undefined,
      descricao: descricao.trim(),
      validade: validade || undefined,
      mao_de_obra: Number(maoDeObra || 0),
      desconto: Number(desconto || 0),
      observacoes: observacoes.trim() || undefined,
      itens,
    }

    const salvarOffline = async () => {
      await adicionarPendenteOrcamento(dto, fotoFile)
      toast.success('Sem internet: orcamento salvo no aparelho e sera enviado automaticamente quando a conexao voltar.')
      router.push('/orcamento')
    }

    setSalvando(true)
    try {
      // Se já sabemos que está offline, nem tenta a rede — vai direto pra fila local.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await salvarOffline()
        return
      }

      // 1. Cria o orçamento
      const orcamento = await comTimeout(orcamentoSvc.createOrcamento(dto))

      // 2. Se tiver foto, faz upload agora que temos o ID
      if (fotoFile) {
        try {
          await orcamentoSvc.uploadFoto(orcamento.id, fotoFile)
        } catch (err) {
          console.error(err)
          // Não bloqueia — orçamento já foi salvo, foto pode ser adicionada depois
          toast.error('Orcamento salvo, mas houve erro ao enviar a foto')
        }
      }

      toast.success('Orcamento salvo')
      router.push(`/orcamento/${orcamento.id}`)
    } catch (error) {
      console.error(error)

      // A conexão caiu bem na hora de salvar (ou é instável demais) — em vez
      // de perder o que foi preenchido, guarda local e sincroniza depois.
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

      toast.error('Erro ao salvar orcamento')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <FileText className="w-5 h-5 text-brand-400" />
        <h1 className="text-lg font-bold flex-1">Novo Orcamento</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="card space-y-3">
          <p className="section-title">Cliente</p>
          <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} className="input" placeholder="Nome do cliente ou empresa *" />
          <input value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} className="input" placeholder="Telefone" inputMode="tel" />
          <input value={clienteEndereco} onChange={e => setClienteEndereco(e.target.value)} className="input" placeholder="Endereco" />
        </div>

        <div className="card space-y-3">
          <p className="section-title">Servico</p>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            className="input min-h-[96px] resize-none"
            placeholder="Descricao do servico *"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Validade</label>
              <input type="date" value={validade} onChange={e => setValidade(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Mao de obra</label>
              <input type="number" min={0} step="0.01" value={maoDeObra} onChange={e => setMaoDeObra(Number(e.target.value))} className="input" />
            </div>
          </div>
        </div>

        {/* ← CARD DE FOTO */}
        <div className="card space-y-3">
          <p className="section-title">Foto do Serviço</p>

          {fotoPreview ? (
            <div className="space-y-2">
              <div className="relative">
                <img
                  src={fotoPreview}
                  alt="Preview da foto"
                  className="w-full rounded-xl object-cover max-h-56"
                />
                <button
                  onClick={removerFoto}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="btn-secondary w-full cursor-pointer flex items-center justify-center gap-2">
                <Camera className="w-4 h-4" />
                Trocar foto
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFotoSelecionada}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-700 rounded-xl p-6 cursor-pointer hover:border-brand-500/50 transition-colors">
              <Camera className="w-8 h-8 text-surface-500" />
              <p className="text-sm text-surface-400 text-center">
                Toque para tirar ou anexar uma foto
              </p>
              <p className="text-xs text-surface-600 text-center">
                Opcional — aparecerá no PDF
              </p>
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                onChange={handleFotoSelecionada}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="section-title mb-0">Itens</p>
            <button onClick={adicionarItemLivre} className="btn-secondary min-h-0 py-2 px-3 text-sm">
              <Plus className="w-4 h-4" />
              Avulso
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              value={busca}
              onChange={e => buscarProdutos(e.target.value)}
              className="input pl-10"
              placeholder="Buscar material do estoque..."
            />
            {resultados.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 bg-surface-900 border border-surface-700 rounded-xl overflow-hidden shadow-xl">
                {resultados.map(produto => (
                  <button
                    key={produto.id}
                    onClick={() => adicionarProduto(produto)}
                    className="w-full p-3 flex items-center gap-3 text-left hover:bg-surface-800 border-b border-surface-800 last:border-b-0"
                  >
                    <Package className="w-4 h-4 text-surface-400 flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{produto.nome}</span>
                      <span className="block text-xs text-surface-400">{formatQuantidade(produto.quantidade, produto.unidade)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {buscando && <p className="text-sm text-surface-400">Buscando...</p>}

          <div className="space-y-3">
            {itens.map((item, index) => (
              <div key={`${item.produto_id || 'livre'}-${index}`} className="bg-surface-900 border border-surface-700 rounded-xl p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <input
                    value={item.nome}
                    onChange={e => atualizarItem(index, { nome: e.target.value })}
                    className="input min-h-0 py-2 text-sm flex-1"
                  />
                  <button onClick={() => removerItem(index)} className="p-2 text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min={0.01} step="0.01" value={item.quantidade} onChange={e => atualizarItem(index, { quantidade: Number(e.target.value) })} className="input min-h-0 py-2 text-sm" placeholder="Qtd" />
                  <input type="number" min={0} step="0.01" value={item.valor_unitario} onChange={e => atualizarItem(index, { valor_unitario: Number(e.target.value) })} className="input min-h-0 py-2 text-sm" placeholder="Valor" />
                  <input type="number" min={0} max={100} step="1" value={item.desconto} onChange={e => atualizarItem(index, { desconto: Number(e.target.value) })} className="input min-h-0 py-2 text-sm" placeholder="Desc %" />
                </div>
                <p className="text-right text-sm text-brand-400 font-semibold">{formatCurrency(itemTotal(item))}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <p className="section-title">Resumo</p>
          <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} className="input min-h-[80px] resize-none" placeholder="Observacoes" />
          <div className="flex justify-between text-sm text-surface-300">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div>
            <label className="label">Desconto geral (%)</label>
            <input type="number" min={0} max={100} value={desconto} onChange={e => setDesconto(Number(e.target.value))} className="input" />
          </div>
          <div className="flex justify-between text-lg font-bold border-t border-surface-700 pt-3">
            <span>Total</span>
            <span className="text-brand-400">{formatCurrency(total)}</span>
          </div>
          <button onClick={salvarOrcamento} disabled={salvando} className="btn-primary w-full">
            {salvando
              ? fotoFile ? 'Salvando e enviando foto...' : 'Salvando...'
              : 'Salvar Orcamento'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
