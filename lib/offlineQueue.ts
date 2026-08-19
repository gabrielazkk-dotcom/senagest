// ============================================================
// Fila offline de ações do sistema
// ============================================================
// Guarda no IndexedDB do aparelho qualquer ação que o usuário
// tentou salvar sem internet (ou que falhou por causa da rede na
// hora de salvar), pra sincronizar com o Supabase automaticamente
// depois. Veja offlineSync.ts para a parte que envia.
//
// Suporta 4 tipos de ação hoje: orçamento, baixa de estoque,
// registro de serviço e pedido de ferramentas — as 4 telas usadas
// em campo, onde falta internet é mais comum.

import { CreateOrcamentoDto } from '../types'
import { ServicoItemInput } from '../services/servico'

const DB_NAME = 'tecgest-offline'
const DB_VERSION = 2
const STORE_NAME = 'acoes_pendentes'
const OFFLINE_QUEUE_EVENT = 'tecgest:fila-offline-mudou'
const STORE_ANTIGO = 'orcamentos_pendentes' // usado numa versão anterior, removido no upgrade

type FotoArmazenada = { blob: Blob; nome: string }

type BasePendente = {
  id: string // id local, gerado no aparelho (não é o id do banco)
  criado_em: string
  tentativas: number
  ultimo_erro?: string
}

export type PendenteOrcamento = BasePendente & {
  tipo: 'orcamento'
  dto: CreateOrcamentoDto
  fotoBlob?: Blob
  fotoNome?: string
}

export type PendenteBaixa = BasePendente & {
  tipo: 'baixa'
  itens: Array<{
    produto_id: string
    cliente_id?: string
    tipo: 'saida'
    quantidade: number
    observacao?: string
  }>
}

export type PendenteServico = BasePendente & {
  tipo: 'servico'
  clienteId?: string
  clienteNome?: string
  clienteTelefone?: string
  clienteCpf?: string
  clienteEmail?: string
  clienteEndereco?: string
  clienteCidade?: string
  clienteObservacoes?: string
  descricao: string
  itens: ServicoItemInput[]
  fotos: FotoArmazenada[]
  videos: FotoArmazenada[]
}

export type PendentePedido = BasePendente & {
  tipo: 'pedido'
  descricao: string
  solicitante: string
  solicitanteId: string
  fotos: FotoArmazenada[]
}

export type AcaoPendente = PendenteOrcamento | PendenteBaixa | PendenteServico | PendentePedido

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponivel neste navegador'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      // Versão anterior guardava só orçamentos numa store separada.
      // Como o formato mudou, não dá pra migrar automaticamente — removemos.
      if (event.oldVersion > 0 && db.objectStoreNames.contains(STORE_ANTIGO)) {
        db.deleteObjectStore(STORE_ANTIGO)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function gerarIdLocal(): string {
  return `pend_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export async function adicionarPendente(
  acao:
    | Omit<PendenteOrcamento, 'id' | 'criado_em' | 'tentativas'>
    | Omit<PendenteBaixa, 'id' | 'criado_em' | 'tentativas'>
    | Omit<PendenteServico, 'id' | 'criado_em' | 'tentativas'>
    | Omit<PendentePedido, 'id' | 'criado_em' | 'tentativas'>
): Promise<string> {
  const db = await abrirDB()
  const id = gerarIdLocal()

  const registro: AcaoPendente = {
    ...acao,
    id,
    criado_em: new Date().toISOString(),
    tentativas: 0,
  } as AcaoPendente

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(registro)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT))
  return id
}

// Atalhos por tipo, pra deixar o código das telas mais legível.
export const adicionarPendenteOrcamento = (dto: CreateOrcamentoDto, foto?: File | null) =>
  adicionarPendente({ tipo: 'orcamento', dto, fotoBlob: foto || undefined, fotoNome: foto?.name })

export const adicionarPendenteBaixa = (itens: PendenteBaixa['itens']) =>
  adicionarPendente({ tipo: 'baixa', itens })

export const adicionarPendenteServico = (
  dados: Omit<PendenteServico, 'id' | 'criado_em' | 'tentativas' | 'tipo' | 'fotos' | 'videos'>,
  fotos: File[],
  videos: File[] = [],
) =>
  adicionarPendente({
    tipo: 'servico',
    ...dados,
    fotos: fotos.map(f => ({ blob: f, nome: f.name })),
    videos: videos.map(f => ({ blob: f, nome: f.name })),
  })

export const adicionarPendentePedido = (descricao: string, solicitante: string, solicitanteId: string, fotos: File[]) =>
  adicionarPendente({
    tipo: 'pedido',
    descricao,
    solicitante,
    solicitanteId,
    fotos: fotos.map(f => ({ blob: f, nome: f.name })),
  })

export async function listarPendentes(): Promise<AcaoPendente[]> {
  const db = await abrirDB()

  const registros = await new Promise<AcaoPendente[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as AcaoPendente[])
    request.onerror = () => reject(request.error)
  })

  db.close()
  return registros.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
}

export async function removerPendente(id: string): Promise<void> {
  const db = await abrirDB()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
}

export async function atualizarPendente(id: string, patch: Partial<AcaoPendente>): Promise<void> {
  const db = await abrirDB()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => {
      const registro = request.result as AcaoPendente | undefined
      if (registro) {
        store.put({ ...registro, ...patch })
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
}

export async function marcarTentativa(id: string, erro: string): Promise<void> {
  const registros = await listarPendentes()
  const registro = registros.find(r => r.id === id)
  if (!registro) return
  await atualizarPendente(id, { tentativas: registro.tentativas + 1, ultimo_erro: erro })
}

export async function contarPendentes(): Promise<number> {
  const registros = await listarPendentes()
  return registros.length
}
