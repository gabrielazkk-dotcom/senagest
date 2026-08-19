'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { contarPendentes } from '../lib/offlineQueue'
import { sincronizarFilaOffline, OFFLINE_QUEUE_EVENT } from '../lib/offlineSync'

interface OfflineQueueContextType {
  pendentes: number
  online: boolean
  sincronizarAgora: () => Promise<void>
}

const OfflineQueueContext = createContext<OfflineQueueContextType | undefined>(undefined)

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [pendentes, setPendentes] = useState(0)
  const [online, setOnline] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [mostrarSucesso, setMostrarSucesso] = useState(false)

  const atualizarContagem = useCallback(async () => {
    setPendentes(await contarPendentes())
  }, [])

  const sincronizarAgora = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    setSincronizando(true)
    try {
      const { enviados } = await sincronizarFilaOffline()
      if (enviados > 0) {
        setMostrarSucesso(true)
        setTimeout(() => setMostrarSucesso(false), 4000)
      }
    } finally {
      setSincronizando(false)
      await atualizarContagem()
    }
  }, [atualizarContagem])

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    atualizarContagem()

    const handleOnline = () => {
      setOnline(true)
      sincronizarAgora()
    }
    const handleOffline = () => setOnline(false)
    const handleFilaMudou = () => atualizarContagem()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(OFFLINE_QUEUE_EVENT, handleFilaMudou)

    // Tenta sincronizar ao abrir o app (caso tenha ficado algo pendente
    // de uma sessão anterior) e periodicamente, caso o evento 'online'
    // do navegador não dispare corretamente em segundo plano.
    sincronizarAgora()
    const intervalo = setInterval(sincronizarAgora, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener(OFFLINE_QUEUE_EVENT, handleFilaMudou)
      clearInterval(intervalo)
    }
  }, [])

  return (
    <OfflineQueueContext.Provider value={{ pendentes, online, sincronizarAgora }}>
      {children}

      {!online && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top bg-amber-500/95 text-black text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          Sem internet — o que você salvar agora fica guardado no aparelho
          {pendentes > 0 && ` (${pendentes} aguardando envio)`}
        </div>
      )}

      {online && pendentes > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top bg-brand-500/95 text-black text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
          <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
          {sincronizando
            ? `Sincronizando ${pendentes} lançamento(s)...`
            : `${pendentes} lançamento(s) aguardando sincronização`}
        </div>
      )}

      {online && pendentes === 0 && mostrarSucesso && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top bg-emerald-500/95 text-black text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Lançamentos sincronizados com sucesso
        </div>
      )}
    </OfflineQueueContext.Provider>
  )
}

export function useOfflineQueue() {
  const ctx = useContext(OfflineQueueContext)
  if (!ctx) throw new Error('useOfflineQueue must be used within OfflineQueueProvider')
  return ctx
}
