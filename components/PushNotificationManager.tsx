'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Loader2, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const SERVICE_WORKER_TIMEOUT = 30_000
const OPERATION_TIMEOUT = 20_000

type Availability = 'checking' | 'supported' | 'install-ios' | 'unsupported'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)))
}

function subscriptionUsesCurrentKey(subscription: PushSubscription) {
  const storedKey = subscription.options.applicationServerKey
  if (!storedKey) return false
  const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  const storedBytes = new Uint8Array(storedKey)
  return storedBytes.length === currentKey.length && storedBytes.every((byte, index) => byte === currentKey[index])
}

function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds)
    promise.then(
      value => { window.clearTimeout(timer); resolve(value) },
      error => { window.clearTimeout(timer); reject(error) },
    )
  })
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandaloneApp() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true
}

function waitForWorkerActivation(worker: ServiceWorker): Promise<void> {
  if (worker.state === 'activated') return Promise.resolve()
  if (worker.state === 'redundant') return Promise.reject(new Error('O service worker anterior esta corrompido.'))

  return new Promise<void>((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', onStateChange)
        resolve()
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange)
        reject(new Error('O service worker nao conseguiu concluir a instalacao.'))
      }
    }

    worker.addEventListener('statechange', onStateChange)
  })
}

async function waitForRegistrationActivation(registration: ServiceWorkerRegistration) {
  if (registration.active?.state === 'activated') return registration

  const pendingWorker = registration.installing || registration.waiting
  if (!pendingWorker) throw new Error('O registro de notificacoes nao possui um service worker ativo.')

  await withTimeout(
    waitForWorkerActivation(pendingWorker),
    SERVICE_WORKER_TIMEOUT,
    'O aplicativo demorou para ativar o servico de notificacoes.',
  )

  return withTimeout(
    navigator.serviceWorker.ready,
    SERVICE_WORKER_TIMEOUT,
    'O aplicativo nao conseguiu iniciar o servico de notificacoes.',
  )
}

async function registerFreshServiceWorker() {
  const registration = await withTimeout(
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }),
    SERVICE_WORKER_TIMEOUT,
    'O aplicativo demorou para preparar as notificacoes.',
  )

  return waitForRegistrationActivation(registration)
}

async function getActiveServiceWorker(): Promise<ServiceWorkerRegistration> {
  const current = await withTimeout(
    navigator.serviceWorker.getRegistration('/'),
    5_000,
    'Nao foi possivel verificar o aplicativo.',
  )

  if (!current) return registerFreshServiceWorker()

  if (current.active?.state === 'activated') {
    current.update().catch(error => console.warn('Atualizacao do service worker adiada:', error))
    return current
  }

  if (current.installing || current.waiting) {
    try {
      return await waitForRegistrationActivation(current)
    } catch (error) {
      console.warn('Instalacao anterior do service worker falhou:', error)
    }
  }

  console.warn('Registro antigo do service worker sera recriado.')
  await current.unregister().catch(unregisterError => {
    console.warn('Nao foi possivel remover o registro antigo:', unregisterError)
  })
  return registerFreshServiceWorker()
}

async function getPushSubscription(registration: ServiceWorkerRegistration) {
  let subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    OPERATION_TIMEOUT,
    'Nao foi possivel verificar a inscricao deste aparelho.',
  )

  // Uma assinatura criada com uma chave VAPID antiga nunca podera receber
  // mensagens da chave atual. Recria-la evita manter um aparelho aparentemente
  // ativo, mas incapaz de receber notificacoes.
  if (subscription && !subscriptionUsesCurrentKey(subscription)) {
    await withTimeout(
      subscription.unsubscribe(),
      OPERATION_TIMEOUT,
      'Nao foi possivel atualizar a inscricao antiga deste aparelho.',
    )
    subscription = null
  }

  return subscription || withTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }),
    OPERATION_TIMEOUT,
    'O servico de notificacoes do celular nao respondeu.',
  )
}

async function dispararTeste() {
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: { type: 'test' },
  })
  if (error) {
    let detail = error.message
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const body = await context.clone().json() as { error?: string }
        if (body.error) detail = body.error
      } catch {
        // Mantem a mensagem original quando a resposta nao for JSON.
      }
    }
    throw new Error(detail)
  }
  const delivery = data?.delivery as { sent?: number; failed?: number } | undefined
  if (!delivery?.sent) throw new Error(`O servidor nao entregou o teste (${delivery?.failed || 0} falha).`)
  return delivery
}

function friendlyError(error: unknown) {
  const pushError = error as { name?: string; message?: string }
  if (pushError.name === 'NotAllowedError') {
    return 'As notificacoes foram bloqueadas. Libere-as nas configuracoes do navegador.'
  }
  if (pushError.name === 'AbortError') {
    return 'O celular interrompeu a ativacao. Feche o aplicativo, abra novamente e tente mais uma vez.'
  }
  return pushError.message || 'Nao foi possivel ativar os alertas neste aparelho.'
}

export default function PushNotificationManager() {
  const { user } = useAuth()
  const [availability, setAvailability] = useState<Availability>('checking')
  const [active, setActive] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return

    if (!VAPID_PUBLIC_KEY) {
      setAvailability('unsupported')
      return
    }

    if (isIosDevice() && !isStandaloneApp()) {
      setAvailability('install-ios')
      return
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setAvailability('unsupported')
      return
    }

    setAvailability('supported')
    setPermission(Notification.permission)

    withTimeout(navigator.serviceWorker.getRegistration('/'), 5_000, 'Tempo limite ao verificar alertas.')
      .then(registration => registration?.pushManager.getSubscription())
      .then(subscription => setActive(Boolean(subscription)))
      .catch(error => {
        console.warn('Nao foi possivel verificar o push:', error)
        setActive(false)
      })
  }, [user])

  const ativar = async () => {
    if (!user || availability !== 'supported') return
    if (!navigator.onLine) {
      toast.error('Conecte-se a internet para ativar os alertas neste aparelho.')
      return
    }

    setLoading(true)
    try {
      const nextPermission = await withTimeout(
        Notification.requestPermission(),
        OPERATION_TIMEOUT,
        'O celular nao respondeu ao pedido de permissao.',
      )
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        toast.error('Permissao de notificacoes nao concedida.')
        return
      }

      const registration = await getActiveServiceWorker()
      const subscription = await getPushSubscription(registration)

      const { error } = await withTimeout(
        supabase.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          subscription: subscription.toJSON(),
          enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,endpoint' }),
        OPERATION_TIMEOUT,
        'A conexao demorou demais para salvar a ativacao.',
      )

      if (error) throw error
      setActive(true)
      try {
        await withTimeout(dispararTeste(), OPERATION_TIMEOUT, 'O teste de notificacao demorou demais.')
        toast.success('Alertas ativados e teste enviado para este aparelho.')
      } catch (testError) {
        console.error('Falha no teste de notificacao:', testError)
        toast.error(`Alertas ativados, mas o teste falhou: ${(testError as Error).message}`, { duration: 8000 })
      }
    } catch (error) {
      console.error('Erro ao ativar notificacoes:', error)
      toast.error(friendlyError(error), { duration: 6000 })
    } finally {
      setLoading(false)
    }
  }

  if (!user || availability === 'checking') return null

  if (availability === 'install-ios') {
    return (
      <button
        type="button"
        onClick={() => toast('No iPhone: toque em Compartilhar, escolha Adicionar a Tela de Inicio, abra o SenaGest pelo novo icone e ative os alertas.', { duration: 8000 })}
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full border border-brand-500/30 bg-surface-900/95 px-3 py-2 text-xs font-medium text-brand-300 shadow-card backdrop-blur-xl"
      >
        <Smartphone className="h-4 w-4" />
        Instale para ativar alertas
      </button>
    )
  }

  if (availability === 'unsupported') {
    return (
      <button
        type="button"
        onClick={() => toast.error('Este navegador nao oferece notificacoes para aplicativos web. Tente pelo Chrome ou instale o aplicativo na tela inicial.')}
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-surface-900/95 px-3 py-2 text-xs text-surface-400 shadow-card backdrop-blur-xl"
      >
        <BellOff className="h-4 w-4" />
        Alertas indisponiveis
      </button>
    )
  }

  if (permission === 'denied') {
    return (
      <button
        type="button"
        onClick={() => toast.error('Libere as notificacoes nas configuracoes do navegador.')}
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-surface-900/95 px-3 py-2 text-xs text-surface-400 shadow-card backdrop-blur-xl"
      >
        <BellOff className="h-4 w-4" />
        Alertas bloqueados
      </button>
    )
  }

  // Depois de confirmar a assinatura, o atalho flutuante cumpriu sua funcao.
  // O estado nulo evita exibi-lo por um instante enquanto o navegador verifica
  // se este aparelho ja esta inscrito.
  if (active === null || active) return null

  return (
    <button
      type="button"
      onClick={ativar}
      disabled={loading}
      className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-xs font-semibold text-white shadow-brand transition-transform active:scale-95"
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <BellRing className="h-4 w-4" />}
      {loading ? 'Preparando alertas...' : 'Ativar alertas'}
    </button>
  )
}
