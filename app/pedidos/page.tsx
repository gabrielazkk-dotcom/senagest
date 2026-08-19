'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { Camera, X, Search } from 'lucide-react'
import { adicionarPendentePedido } from '../../lib/offlineQueue'
import { pareceErroDeRede } from '../../lib/offlineSync'
import { solicitarNotificacao } from '../../lib/notifications'

interface Pedido {
  id: number
  created_at: string
  descricao: string
  solicitante: string
  status: string
  foto_url?: string // Mantido para compatibilidade com pedidos antigos
  fotos_urls?: string[] | null // Nova coluna para receber a lista de links das imagens
}

export default function PedidosPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregandoPedidos, setCarregandoPedidos] = useState(true)
  const [novaDescricao, setNovaDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  
  // Mantém os arquivos selecionados e a imagem aberta para visualização.
  const [fotos, setFotos] = useState<File[]>([])
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  async function buscarPedidos() {
    try {
      setCarregandoPedidos(true)
      const { data, error } = await supabase
        .from('pedidos_ferramentas')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (data) setPedidos(data)
    } catch (error: any) {
      console.error(error)
      toast.error('Erro ao carregar pedidos.')
    } finally {
      setCarregandoPedidos(false)
    }
  }

  async function concluirPedido(id: number) {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('pedidos_ferramentas')
        .update({
          status: 'concluido',
          concluido_por: user.id,
          concluido_em: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pendente')
        .select('id')
        .single()
      
      if (error) throw error
      await solicitarNotificacao({ type: 'tool_returned', requestId: data.id })
      toast.success('Pedido concluído e reposição registrada!')
      await buscarPedidos()
    } catch {
      toast.error('Erro ao concluir pedido.')
    }
  }

  async function criarPedido(e: React.FormEvent) {
    e.preventDefault()
    if (!novaDescricao.trim() || !user) return

    const descricaoParaSalvar = novaDescricao.trim()
    const solicitante = profile?.nome || user?.email || 'Tecnico'
    const fotosParaSalvar = fotos

    const limparFormulario = () => {
      setNovaDescricao('')
      setFotos([])
      const inputFoto = document.getElementById('input-foto') as HTMLInputElement
      if (inputFoto) inputFoto.value = ''
    }

    const salvarOffline = async () => {
      await adicionarPendentePedido(descricaoParaSalvar, solicitante, user.id, fotosParaSalvar)
      toast.success('Sem internet: pedido salvo no aparelho e sera enviado quando a conexao voltar.')
      limparFormulario()
    }

    try {
      setEnviando(true)

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await salvarOffline()
        return
      }

      const urlsDasFotos: string[] = []

      // Envia cada foto separadamente para evitar uma requisição muito grande.
      if (fotos.length > 0) {
        toast.loading(`Enviando ${fotos.length} foto(s)...`, { id: 'upload-foto' })
        
        for (const foto of fotos) {
          const extensao = foto.name.split('.').pop()
          const nomeArquivo = `ferramentas/${Date.now()}-${Math.random().toString(36).substring(2)}.${extensao}`
          
          const { error: uploadError } = await supabase.storage
            .from('fotos-servicos')
            .upload(nomeArquivo, foto)

          if (uploadError) throw uploadError

          const { data } = supabase.storage
            .from('fotos-servicos')
            .getPublicUrl(nomeArquivo)
            
          urlsDasFotos.push(data.publicUrl)
        }
        toast.dismiss('upload-foto')
      }

      // Persiste as URLs geradas após a conclusão dos uploads.
      const { data, error } = await supabase
        .from('pedidos_ferramentas')
        .insert([{ 
          descricao: descricaoParaSalvar, 
          solicitante,
          solicitante_id: user.id,
          status: 'pendente',
          fotos_urls: urlsDasFotos // Grava o array de links no banco
        }])
        .select('id')
        .single()

      if (error) throw error
      await solicitarNotificacao({ type: 'tool_request', requestId: data.id })
      
      toast.success('Pedido enviado com sucesso!')
      limparFormulario()
      
      buscarPedidos()
    } catch (error) {
      toast.dismiss('upload-foto')

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
      toast.error('Erro ao enviar o pedido.')
    } finally {
      setEnviando(false)
    }
  }

  useEffect(() => { if (user) buscarPedidos() }, [user])

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-surface-950 text-surface-50 pb-20 p-4">
      <header className="page-header mb-6">
        <h1 className="text-xl font-bold">Pedir Ferramentas</h1>
      </header>

      <form onSubmit={criarPedido} className="card mb-6 flex flex-col gap-4">
        <textarea 
          className="input w-full min-h-[80px]" 
          placeholder="Descreva a ferramenta ou o serviço realizado..."
          value={novaDescricao}
          onChange={(e) => setNovaDescricao(e.target.value)}
          required
        />
        
        {/* Área de upload com pré-visualização das imagens selecionadas. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-surface-400 block">
              Anexar fotos do local/serviço (opcional)
            </label>
            {fotos.length > 0 && (
              <span className="text-xs text-brand-400">{fotos.length} selecionada(s)</span>
            )}
          </div>
          
          <div className="card border-dashed border-2 border-surface-700 bg-surface-950/50 p-4 flex flex-col items-center justify-center relative cursor-pointer hover:bg-surface-900 transition-colors">
            <Camera className="w-6 h-6 text-surface-400 mb-1" />
            <span className="text-xs text-surface-400">Toque para adicionar fotos</span>
            <input 
              id="input-foto"
              type="file" 
              accept="image/*"
              multiple // Permite selecionar mais de uma
              onChange={(e) => {
                if (e.target.files) {
                  const novosArquivos = Array.from(e.target.files)
                  setFotos(prev => [...prev, ...novosArquivos])
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Listagem de fotos prontas para serem enviadas */}
          {fotos.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2">
              {fotos.map((f, idx) => (
                <div key={idx} className="flex items-center justify-between bg-surface-900 border border-surface-800 p-2 rounded-lg text-xs">
                  <span className="truncate text-surface-300 flex-1 mr-2">{f.name}</span>
                  <button 
                    type="button"
                    onClick={() => setFotos(prev => prev.filter((_, i) => i !== idx))}
                    className="text-red-400 p-1 hover:bg-red-400/10 rounded flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="submit" disabled={enviando} className="btn-primary w-full mt-2">
          {enviando ? 'Enviando...' : 'Enviar Pedido'}
        </button>
      </form>

      {/* Listagem dos Pedidos Pendentes */}
      <div className="flex flex-col gap-4">
        {carregandoPedidos ? (
          <p className="text-sm text-surface-400 text-center py-4">Carregando pedidos...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-4">Nenhum pedido pendente.</p>
        ) : (
          pedidos.map((pedido) => (
            <div key={pedido.id} className="card flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium whitespace-pre-wrap">{pedido.descricao}</p>
                  <p className="text-[10px] text-surface-400 mt-1">👤 {pedido.solicitante}</p>
                </div>
                <button 
                  onClick={() => concluirPedido(pedido.id)}
                  className="bg-brand-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-600 ml-2 flex-shrink-0"
                >
                  Concluir
                </button>
              </div>
              
              {/* Lista rolável das fotos anexadas ao pedido. */}
              {pedido.fotos_urls && pedido.fotos_urls.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-2 snap-x">
                  {pedido.fotos_urls.map((url, index) => (
                    <div 
                      key={index}
                      className="w-48 h-36 flex-shrink-0 rounded-lg overflow-hidden border border-surface-800 cursor-pointer group relative bg-black/40 flex justify-center snap-center"
                      onClick={() => setFotoAmpliada(url)}
                    >
                      <img 
                        src={url} 
                        alt={`Foto anexa ${index + 1}`} 
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Search className="w-6 h-6 text-white drop-shadow-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Regra de compatibilidade: Exibe foto antiga de coluna única caso exista */}
              {!pedido.fotos_urls && pedido.foto_url && (
                <div 
                  className="mt-2 w-48 h-36 rounded-lg overflow-hidden border border-surface-800 cursor-pointer group relative bg-black/40 flex justify-center"
                  onClick={() => setFotoAmpliada(pedido.foto_url!)}
                >
                  <img 
                    src={pedido.foto_url} 
                    alt="Foto anexada antiga" 
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Search className="w-6 h-6 text-white drop-shadow-lg" />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal de visualização da foto selecionada. */}
      {fotoAmpliada && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setFotoAmpliada(null)}
        >
          <button 
            type="button"
            className="absolute top-4 right-4 bg-surface-800/50 p-2 rounded-full text-white hover:bg-surface-700 transition-colors z-10"
            onClick={() => setFotoAmpliada(null)}
          >
            <X className="w-6 h-6" />
          </button>
          
          <img 
            src={fotoAmpliada} 
            alt="Foto ampliada" 
            className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  )
}
