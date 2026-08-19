import Link from 'next/link'
import { WifiOff, RefreshCw, ShieldCheck } from 'lucide-react'

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-surface-950 px-6 py-10 flex items-center justify-center">
      <section className="w-full max-w-md card p-7 text-center space-y-6 border-brand-500/20">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-brand-400" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase text-brand-400">Modo offline</p>
          <h1 className="text-2xl font-bold text-white">Você continua em operação</h1>
          <p className="text-sm leading-6 text-surface-400">
            Serviços, baixas, pedidos e orçamentos podem ser guardados neste aparelho e enviados quando a conexão voltar.
          </p>
        </div>
        <div className="rounded-xl border border-surface-700 bg-surface-900/70 p-4 flex gap-3 text-left">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs leading-5 text-surface-300">
            Não limpe os dados do navegador enquanto houver lançamentos aguardando sincronização.
          </p>
        </div>
        <Link href="/dashboard" className="btn-primary w-full">
          <RefreshCw className="w-4 h-4" />
          Tentar abrir novamente
        </Link>
      </section>
    </main>
  )
}
