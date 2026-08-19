'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Camera, CheckCircle, Download, FileText, MessageCircle, Package, Play, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { orcamentoSvc } from '../../../services/orcamento'
import { gerarPdfOrcamento, compartilharWhatsApp } from '../../../pdf'
import { Orcamento, StatusOrcamento } from '../../../types'
import { cn, formatCurrency, formatDate, generateOrcamentoNumber, getStatusColor, getStatusLabel } from '../../../utils'

const statusOptions: StatusOrcamento[] = ['pendente', 'aprovado', 'em_execucao', 'finalizado', 'recusado']

export default function OrcamentoDetalhePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const loadOrcamento = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orcamentoSvc.getOrcamento(params.id)
      setOrcamento(data)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar orcamento')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { loadOrcamento() }, [loadOrcamento])

  const mudarStatus = async (status: StatusOrcamento) => {
    if (!orcamento || status === orcamento.status) return

    setBusy(true)
    try {
      await orcamentoSvc.updateStatus(orcamento.id, status)
      toast.success('Status atualizado')
      await loadOrcamento()
    } catch (error) {
      console.error(error)
      toast.error('Erro ao atualizar status')
    } finally {
      setBusy(false)
    }
  }

  const registrarBaixa = async () => {
    if (!orcamento) return

    setBusy(true)
    try {
      await orcamentoSvc.duplicarComoBaixa(orcamento)
      await orcamentoSvc.updateStatus(orcamento.id, 'em_execucao')
      toast.success('Baixa registrada no estoque')
      await loadOrcamento()
    } catch (error) {
      console.error(error)
      toast.error('Erro ao registrar baixa')
    } finally {
      setBusy(false)
    }
  }

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !orcamento) return

    setUploadingFoto(true)
    try {
      await orcamentoSvc.uploadFoto(orcamento.id, file)
      toast.success('Foto anexada com sucesso!')
      await loadOrcamento()
    } catch (error) {
      console.error(error)
      toast.error('Erro ao enviar foto')
    } finally {
      setUploadingFoto(false)
      // limpa o input para permitir re-upload do mesmo arquivo
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-brand-400 animate-spin" />
      </div>
    )
  }

  if (!orcamento) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="card text-center max-w-md">
          <FileText className="w-10 h-10 text-surface-500 mx-auto mb-3" />
          <p className="text-surface-300">Orcamento nao encontrado.</p>
        </div>
      </div>
    )
  }

  const itensComProduto = (orcamento.itens || []).some(item => item.produto_id)

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <FileText className="w-5 h-5 text-brand-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{generateOrcamentoNumber(orcamento.numero)}</h1>
          <p className="text-xs text-surface-400 truncate">{orcamento.cliente_nome}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn('badge', getStatusColor(orcamento.status))}>
              {getStatusLabel(orcamento.status)}
            </span>
            <span className="text-xs text-surface-400">{formatDate(orcamento.created_at)}</span>
          </div>
          <div>
            <p className="text-sm text-surface-400">Cliente</p>
            <p className="font-semibold text-white">{orcamento.cliente_nome}</p>
            {(orcamento.cliente_telefone || orcamento.cliente_endereco) && (
              <p className="text-sm text-surface-400">{[orcamento.cliente_telefone, orcamento.cliente_endereco].filter(Boolean).join(' | ')}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-surface-400">Servico</p>
            <p className="text-white whitespace-pre-wrap">{orcamento.descricao}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => gerarPdfOrcamento(orcamento)} className="btn-secondary">
            <Download className="w-4 h-4" />
            PDF
          </button>
          <button onClick={() => compartilharWhatsApp(orcamento)} className="btn-secondary">
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>
        </div>

        <div className="card space-y-3">
          <p className="section-title">Status</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {statusOptions.map(status => (
              <button
                key={status}
                onClick={() => mudarStatus(status)}
                disabled={busy}
                className={cn(
                  'px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
                  status === orcamento.status
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                    : 'bg-surface-900 border-surface-700 text-surface-300 hover:border-surface-500'
                )}
              >
                {getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>

        {itensComProduto && (
          <button onClick={registrarBaixa} disabled={busy} className="btn-primary w-full bg-red-500 hover:bg-red-400">
            <Play className="w-4 h-4" />
            Registrar baixa dos materiais
          </button>
        )}

        <div className="card space-y-3">
          <p className="section-title">Itens</p>
          {(orcamento.itens || []).map(item => (
            <div key={item.id} className="bg-surface-900 border border-surface-700 rounded-xl p-3 flex items-start gap-3">
              <Package className="w-4 h-4 text-surface-400 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white">{item.nome}</p>
                <p className="text-xs text-surface-400">
                  {item.quantidade} x {formatCurrency(item.valor_unitario)}
                  {item.desconto > 0 ? ` | ${item.desconto}% desc.` : ''}
                </p>
              </div>
              <p className="font-semibold text-brand-400 text-sm">{formatCurrency(item.total)}</p>
            </div>
          ))}
        </div>

        <div className="card space-y-2">
          <div className="flex justify-between text-sm text-surface-300">
            <span>Subtotal</span>
            <span>{formatCurrency(orcamento.subtotal)}</span>
          </div>
          {orcamento.mao_de_obra > 0 && (
            <div className="flex justify-between text-sm text-surface-300">
              <span>Mao de obra</span>
              <span>{formatCurrency(orcamento.mao_de_obra)}</span>
            </div>
          )}
          {orcamento.desconto > 0 && (
            <div className="flex justify-between text-sm text-red-300">
              <span>Desconto</span>
              <span>{orcamento.desconto}%</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t border-surface-700 pt-3">
            <span>Total</span>
            <span className="text-brand-400">{formatCurrency(orcamento.total)}</span>
          </div>
        </div>

        {orcamento.observacoes && (
          <div className="card space-y-2">
            <p className="section-title">Observacoes</p>
            <p className="text-sm text-surface-300 whitespace-pre-wrap">{orcamento.observacoes}</p>
          </div>
        )}

        {/* ← CARD DE FOTO NOVO */}
        <div className="card space-y-3">
          <p className="section-title">Foto do Serviço</p>

          {orcamento.foto_url ? (
            <div className="space-y-2">
              <img
                src={orcamento.foto_url}
                alt="Foto do serviço"
                className="w-full rounded-xl object-cover max-h-64"
              />
              <label className={cn(
                'btn-secondary w-full cursor-pointer flex items-center justify-center gap-2',
                uploadingFoto && 'opacity-60 pointer-events-none'
              )}>
                {uploadingFoto
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Camera className="w-4 h-4" />
                }
                {uploadingFoto ? 'Enviando...' : 'Trocar foto'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFotoUpload}
                  disabled={uploadingFoto}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <label className={cn(
              'flex flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-700 rounded-xl p-6 cursor-pointer hover:border-brand-500/50 transition-colors',
              uploadingFoto && 'opacity-60 pointer-events-none'
            )}>
              {uploadingFoto
                ? <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
                : <Camera className="w-8 h-8 text-surface-500" />
              }
              <p className="text-sm text-surface-400 text-center">
                {uploadingFoto ? 'Enviando foto...' : 'Toque para tirar ou anexar uma foto'}
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoUpload}
                disabled={uploadingFoto}
                className="hidden"
              />
            </label>
          )}
        </div>

        {orcamento.status === 'finalizado' && (
          <div className="card flex items-center gap-3 border-green-500/20 bg-green-500/5">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-sm text-green-100">Servico finalizado.</p>
          </div>
        )}
      </div>
    </div>
  )
}