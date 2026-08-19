// ============================================================
// Sincronizador da fila offline
// ============================================================
// Percorre as ações guardadas localmente (offlineQueue.ts) e
// tenta enviar cada uma pro Supabase, na ordem em que foram
// criadas. Uma ação só sai da fila quando é confirmado que o
// servidor recebeu.
//
// Erros de rede (sem internet) interrompem a sincronização sem
// descartar nada — tentamos de novo na próxima vez. Outros erros
// (ex: dado invalido) ficam registrados no proprio item, mas nao
// travam a fila: seguimos para o proximo item.

import { supabase } from './supabase'
import { orcamentoSvc } from '../services/orcamento'
import { servicoSvc } from '../services/servico'
import { solicitarNotificacao } from './notifications'
import { estoqueSvc } from '../estoque'
import {
  listarPendentes,
  removerPendente,
  atualizarPendente,
  marcarTentativa,
  AcaoPendente,
} from './offlineQueue'

export const OFFLINE_QUEUE_EVENT = 'tecgest:fila-offline-mudou'

function avisarMudanca() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT))
  }
}

export function pareceErroDeRede(erro: unknown): boolean {
  if (!erro) return false
  if (erro instanceof TypeError) return true // "Failed to fetch" no navegador
  const msg = erro instanceof Error ? erro.message : String(erro)
  return /failed to fetch|network|conexao|offline|timeout/i.test(msg)
}

async function subirFoto(bucket: string, pasta: string, foto: { blob: Blob; nome: string }): Promise<string> {
  const extensao = foto.nome.split('.').pop()
  const nomeArquivo = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extensao}`

  const { error: uploadError } = await supabase.storage.from(bucket).upload(nomeArquivo, foto.blob)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(bucket).getPublicUrl(nomeArquivo)
  return data.publicUrl
}

async function enviarOrcamento(item: Extract<AcaoPendente, { tipo: 'orcamento' }>) {
  const orcamento = await orcamentoSvc.createOrcamento(item.dto)

  if (item.fotoBlob) {
    try {
      const arquivo = new File([item.fotoBlob], item.fotoNome || 'foto.jpg', {
        type: item.fotoBlob.type || 'image/jpeg',
      })
      await orcamentoSvc.uploadFoto(orcamento.id, arquivo)
    } catch (erroFoto) {
      // Orçamento já foi criado — a foto pode ser adicionada depois manualmente,
      // então não deixamos o item preso na fila só por causa da foto.
      console.error('Erro ao enviar foto do orcamento pendente:', erroFoto)
    }
  }
}

async function enviarBaixa(item: Extract<AcaoPendente, { tipo: 'baixa' }>) {
  const restantes = [...item.itens]

  while (restantes.length > 0) {
    const atual = restantes[0]
    try {
      await estoqueSvc.darBaixa(atual)
      restantes.shift()
    } catch (erro) {
      if (pareceErroDeRede(erro)) {
        // Salva o progresso feito até agora e propaga o erro de rede pra
        // parar a sincronização geral (será retomado do que faltou depois).
        await atualizarPendente(item.id, { itens: restantes } as Partial<AcaoPendente>)
        throw erro
      }
      // Erro de negócio (ex: produto não existe mais) — pula esse item e
      // segue tentando os outros, registrando o problema.
      console.error('Erro ao sincronizar item de baixa:', erro)
      restantes.shift()
    }
  }
}

async function enviarServico(item: Extract<AcaoPendente, { tipo: 'servico' }>) {
  const urlsDasFotos: string[] = []
  const urlsDosVideos: string[] = []
  for (const foto of item.fotos) {
    urlsDasFotos.push(await subirFoto('fotos-servicos', 'servicos', foto))
  }
  for (const video of item.videos || []) {
    urlsDosVideos.push(await subirFoto('fotos-servicos', 'servicos/videos', video))
  }

  await servicoSvc.registrarServico({
    cliente: item.clienteId ? ({ id: item.clienteId } as any) : null,
    clienteNome: item.clienteNome,
    clienteTelefone: item.clienteTelefone,
    clienteCpf: item.clienteCpf,
    clienteEmail: item.clienteEmail,
    clienteEndereco: item.clienteEndereco,
    clienteCidade: item.clienteCidade,
    clienteObservacoes: item.clienteObservacoes,
    descricao: item.descricao,
    itens: item.itens,
    fotos_urls: urlsDasFotos,
    videos_urls: urlsDosVideos,
  } as any)
}

async function enviarPedido(item: Extract<AcaoPendente, { tipo: 'pedido' }>) {
  const urlsDasFotos: string[] = []
  for (const foto of item.fotos) {
    urlsDasFotos.push(await subirFoto('fotos-servicos', 'ferramentas', foto))
  }

  const { data, error } = await supabase
    .from('pedidos_ferramentas')
    .insert([{
      descricao: item.descricao,
      solicitante: item.solicitante,
      solicitante_id: item.solicitanteId,
      status: 'pendente',
      fotos_urls: urlsDasFotos,
    }])
    .select('id')
    .single()

  if (error) throw error
  await solicitarNotificacao({ type: 'tool_request', requestId: data.id })
}

async function enviarUmPendente(item: AcaoPendente): Promise<'enviado' | 'rede' | 'erro'> {
  try {
    switch (item.tipo) {
      case 'orcamento':
        await enviarOrcamento(item)
        break
      case 'baixa':
        await enviarBaixa(item)
        break
      case 'servico':
        await enviarServico(item)
        break
      case 'pedido':
        await enviarPedido(item)
        break
    }

    await removerPendente(item.id)
    return 'enviado'
  } catch (erro) {
    if (pareceErroDeRede(erro)) {
      return 'rede'
    }

    console.error('Erro ao sincronizar acao pendente:', erro)
    const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
    await marcarTentativa(item.id, mensagem)
    return 'erro'
  }
}

let sincronizando = false

export async function sincronizarFilaOffline(): Promise<{ enviados: number; restantes: number }> {
  // Evita duas sincronizações rodando ao mesmo tempo (ex: evento 'online'
  // disparando junto com o intervalo periódico).
  if (sincronizando) return { enviados: 0, restantes: (await listarPendentes()).length }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { enviados: 0, restantes: (await listarPendentes()).length }
  }

  sincronizando = true
  let enviados = 0

  try {
    const pendentes = await listarPendentes()

    for (const item of pendentes) {
      const resultado = await enviarUmPendente(item)
      if (resultado === 'enviado') {
        enviados += 1
        avisarMudanca()
      } else if (resultado === 'rede') {
        // Sem internet de verdade (mesmo que navigator.onLine diga que sim,
        // as vezes o sinal e fraco) — para por aqui e tenta de novo depois.
        break
      }
      // resultado === 'erro': item ja foi marcado, seguimos para o proximo
    }
  } finally {
    sincronizando = false
  }

  const restantes = (await listarPendentes()).length
  return { enviados, restantes }
}
