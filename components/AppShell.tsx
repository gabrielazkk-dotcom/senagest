'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, BriefcaseBusiness, Clock3, FileDown, FileText, History, KeyRound, LayoutDashboard, LoaderCircle, LogOut, MapPinned, MoreHorizontal, Package, Settings, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../utils'

const publicPaths = ['/', '/login', '/offline']
const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/servicos', icon: BriefcaseBusiness, label: 'Servicos' },
  { href: '/estoque', icon: Package, label: 'Estoque' },
  { href: '/logins', icon: KeyRound, label: 'Logins' },
  { href: '/ponto', icon: Clock3, label: 'Ponto' },
  { href: '/localizacoes', icon: MapPinned, label: 'Localizacao' },
  { href: '/pedidos', icon: Wrench, label: 'Pedir ferramentas' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, loading, signOut, isAdmin } = useAuth()
  const [stockPdfLoading, setStockPdfLoading] = useState(false)
  const isPublic = publicPaths.includes(pathname)

  const downloadStockPdf = async () => {
    if (stockPdfLoading) return
    setStockPdfLoading(true)
    toast.loading('Gerando relatorio do estoque...', { id: 'stock-pdf' })
    try {
      const [{ estoqueSvc }, { generateStockPdfBlob, stockPdfFileName }] = await Promise.all([
        import('../estoque'), import('../lib/stockPdf'),
      ])
      const [products, categories] = await Promise.all([estoqueSvc.getProdutos(), estoqueSvc.getCategorias()])
      if (products.length === 0) throw new Error('Nenhum produto ativo encontrado')
      const completeProducts = products.map(product => ({
        ...product,
        categoria: product.categoria || categories.find(category => category.id === product.categoria_id),
      }))
      const generatedAt = new Date()
      const blob = generateStockPdfBlob(completeProducts, { generatedAt, generatedBy: profile?.nome })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = stockPdfFileName(generatedAt)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('PDF do estoque pronto para salvar.', { id: 'stock-pdf' })
    } catch (error) {
      console.error(error)
      toast.error((error as { message?: string }).message || 'Nao foi possivel gerar o PDF do estoque.', { id: 'stock-pdf' })
    } finally {
      setStockPdfLoading(false)
    }
  }

  useEffect(() => { if (!isPublic && !loading && !user) router.replace('/login') }, [isPublic, loading, user, router])
  if (isPublic) return <>{children}</>
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>
  if (!user) return null

  return <div className="flex min-h-screen flex-col">
    <header className="safe-top relative z-40 border-b border-white/[0.07] bg-surface-950/90 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-brand"><Wrench className="h-4 w-4 text-white" /></div>
          <div><span className="text-lg font-bold tracking-tight text-white">Sena<span className="text-brand-400">Gest</span></span><p className="-mt-0.5 text-[9px] uppercase tracking-[0.18em] text-surface-500">Gestao tecnica</p></div>
        </Link>
        <div className="flex items-center gap-1">
          <details className="relative">
            <summary aria-label="Mais opcoes" className="list-none cursor-pointer rounded-xl p-2 text-surface-400 hover:text-surface-200"><MoreHorizontal className="h-5 w-5" /></summary>
            <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl border border-white/10 bg-surface-900 p-2 shadow-card">
              <Link href="/orcamento" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-800"><FileText className="h-4 w-4" />Orcamentos</Link>
              <Link href="/historico" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-800"><History className="h-4 w-4" />Historico</Link>
              <Link href="/relatorios/produtos" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-800"><BarChart3 className="h-4 w-4" />Produtos mais utilizados</Link>
              <button type="button" disabled={stockPdfLoading} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void downloadStockPdf() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-800 disabled:opacity-60">{stockPdfLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF do estoque atual</button>
            </div>
          </details>
          {isAdmin && <Link href="/admin/usuarios" aria-label="Usuarios" className={cn('rounded-xl p-2', pathname.startsWith('/admin') ? 'bg-brand-500/10 text-brand-400' : 'text-surface-400')}><Settings className="h-5 w-5" /></Link>}
          <button aria-label="Sair" onClick={async () => { await signOut(); router.replace('/login') }} className="rounded-xl p-2 text-surface-400 hover:text-red-400"><LogOut className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto pb-24">{children}</main>
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-surface-950/90 px-2 py-2 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center justify-around">
        {navItems.map(item => { const active = pathname === item.href || pathname.startsWith(item.href + '/'); return <Link key={item.href} href={item.href} className={cn('nav-item flex-1', active && 'active')}><item.icon className="h-[18px] w-[18px]" /><span className="mt-1 text-center text-[9px] leading-tight sm:text-[10px]">{item.label}</span></Link> })}
      </div>
    </nav>
  </div>
}
