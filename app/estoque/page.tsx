'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit2, Minus, Package, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { estoqueSvc } from '../../estoque'
import type { Categoria, CreateProdutoDto, ProdutoComStatus, UnidadeMedida } from '../../types'
import { cn, formatQuantidade } from '../../utils'

const unidades: UnidadeMedida[] = ['un', 'pç', 'm', 'cx', 'rolo', 'par', 'kit']
const blank = (): CreateProdutoDto => ({ nome: '', categoria_id: '', marca: '', modelo: '', descricao: '', preco: undefined, quantidade: 0, estoque_minimo: 1, unidade: 'un', observacoes: '' })

export default function EstoquePage() {
  const [products, setProducts] = useState<ProdutoComStatus[]>([])
  const [categories, setCategories] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'todos'|'ok'|'baixo'|'zerado'>('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProdutoComStatus | null>(null)
  const [form, setForm] = useState<CreateProdutoDto>(blank())
  const [adjusting, setAdjusting] = useState<ProdutoComStatus | null>(null)
  const [adjustMode, setAdjustMode] = useState<'add'|'remove'>('add')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([estoqueSvc.getProdutos(), estoqueSvc.getCategorias()])
      setProducts(p.map(item => ({ ...item, categoria: c.find(cat => cat.id === item.categoria_id) })))
      setCategories(c)
    } catch (error) { console.error(error); toast.error('Erro ao carregar o estoque') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => products.filter(product => {
    const term = search.toLocaleLowerCase('pt-BR')
    const matchesText = `${product.nome} ${product.marca || ''} ${product.modelo || ''} ${product.descricao || ''}`.toLocaleLowerCase('pt-BR').includes(term)
    return matchesText && (!category || product.categoria_id === category) && (status === 'todos' || product.status_estoque === status)
  }), [products, search, category, status])

  const openNew = () => { setEditing(null); setForm(blank()); setFormOpen(true) }
  const openEdit = (product: ProdutoComStatus) => {
    setEditing(product)
    setForm({ nome: product.nome, categoria_id: product.categoria_id || '', marca: product.marca || '', modelo: product.modelo || '', descricao: product.descricao || '', preco: product.preco, quantidade: product.quantidade, estoque_minimo: product.estoque_minimo, unidade: product.unidade, observacoes: product.observacoes || '' })
    setFormOpen(true)
  }

  const saveProduct = async () => {
    if (!form.nome.trim()) return toast.error('Informe o nome do produto')
    if (form.quantidade < 0 || form.estoque_minimo < 0 || (form.preco != null && form.preco < 0)) return toast.error('Valores nao podem ser negativos')
    setSaving(true)
    try {
      const payload = { ...form, nome: form.nome.trim(), categoria_id: form.categoria_id || undefined, preco: form.preco === undefined || Number.isNaN(form.preco) ? undefined : Number(form.preco) }
      if (editing) {
        const metadata: Partial<CreateProdutoDto> = { ...payload }
        delete metadata.quantidade
        await estoqueSvc.updateProduto(editing.id, metadata)
      } else await estoqueSvc.createProduto(payload)
      toast.success(editing ? 'Produto atualizado' : 'Produto cadastrado')
      setFormOpen(false); await load()
    } catch (error) { console.error(error); toast.error((error as { message?: string }).message || 'Erro ao salvar produto') }
    finally { setSaving(false) }
  }

  const removeProduct = async (product: ProdutoComStatus) => {
    if (!confirm(`Excluir ${product.nome} do estoque? O historico sera preservado.`)) return
    try { await estoqueSvc.deleteProduto(product.id); toast.success('Produto excluido'); await load() }
    catch (error) { toast.error((error as { message?: string }).message || 'Erro ao excluir') }
  }

  const openAdjust = (product: ProdutoComStatus, mode: 'add'|'remove') => {
    setAdjusting(product); setAdjustMode(mode); setAdjustAmount(''); setAdjustReason('')
  }
  const adjust = async () => {
    if (!adjusting) return
    const amount = Number(adjustAmount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Informe uma quantidade valida')
    if (adjustMode === 'remove' && amount > adjusting.quantidade) return toast.error('Quantidade maior que o estoque disponivel')
    setSaving(true)
    try {
      await estoqueSvc.ajustarEstoque(adjusting.id, adjustMode === 'add' ? amount : -amount, adjustReason)
      toast.success(adjustMode === 'add' ? 'Estoque adicionado' : 'Estoque removido')
      setAdjusting(null); await load()
    } catch (error) { toast.error((error as { message?: string }).message || 'Erro ao alterar estoque') }
    finally { setSaving(false) }
  }

  return <div className="animate-fade-in">
    <div className="page-header"><Package className="h-5 w-5 text-brand-400" /><h1 className="flex-1 text-lg font-bold">Estoque</h1><button onClick={openNew} className="btn-primary min-h-0 px-3 py-2 text-sm"><Plus className="h-4 w-4" />Produto</button></div>
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="stat-card"><strong className="text-xl">{products.length}</strong><span className="text-xs text-surface-400">Produtos</span></div>
        <div className="stat-card"><strong className="text-xl text-amber-400">{products.filter(p=>p.status_estoque==='baixo').length}</strong><span className="text-xs text-surface-400">Baixos</span></div>
        <div className="stat-card"><strong className="text-xl text-red-400">{products.filter(p=>p.status_estoque==='zerado').length}</strong><span className="text-xs text-surface-400">Zerados</span></div>
      </div>
      <div className="card space-y-3">
        <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-surface-500" /><input className="input pl-10" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar produtos" /></div>
        <div className="grid grid-cols-2 gap-2"><select className="input" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas categorias</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select><select className="input" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="todos">Todos os saldos</option><option value="ok">Estoque normal</option><option value="baixo">Estoque baixo</option><option value="zerado">Sem estoque</option></select></div>
      </div>
      {loading ? <div className="card h-28 animate-pulse" /> : filtered.length === 0 ? <div className="card py-10 text-center text-surface-400">Nenhum produto encontrado</div> : <div className="space-y-3">{filtered.map(product => <div key={product.id} className="card space-y-3">
        <div className="flex items-start gap-3"><div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', product.status_estoque==='zerado'?'bg-red-500/10':product.status_estoque==='baixo'?'bg-amber-500/10':'bg-emerald-500/10')}><Package className={cn('h-5 w-5', product.status_estoque==='zerado'?'text-red-400':product.status_estoque==='baixo'?'text-amber-400':'text-emerald-400')} /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{product.nome}</p><p className="text-xs text-surface-400">{product.categoria?.nome || 'Sem categoria'}{product.marca ? ` · ${product.marca}` : ''}{product.modelo ? ` · ${product.modelo}` : ''}</p>{product.descricao && <p className="mt-1 line-clamp-2 text-xs text-surface-500">{product.descricao}</p>}</div><div className="text-right"><strong className="text-lg">{formatQuantidade(product.quantidade, product.unidade)}</strong><p className="text-[10px] text-surface-500">min. {formatQuantidade(product.estoque_minimo,product.unidade)}</p>{product.preco != null && <p className="text-xs text-emerald-400">R$ {Number(product.preco).toFixed(2).replace('.',',')}</p>}</div></div>
        <div className="grid grid-cols-4 gap-2"><button onClick={()=>openAdjust(product,'add')} className="btn-secondary min-h-0 px-2 py-2 text-xs"><Plus className="h-4 w-4" />Entrada</button><button onClick={()=>openAdjust(product,'remove')} className="btn-secondary min-h-0 px-2 py-2 text-xs"><Minus className="h-4 w-4" />Saida</button><button onClick={()=>openEdit(product)} className="btn-secondary min-h-0 px-2 py-2 text-xs"><Edit2 className="h-4 w-4" />Editar</button><button onClick={()=>removeProduct(product)} className="btn-danger min-h-0 px-2 py-2 text-xs"><Trash2 className="h-4 w-4" /></button></div>
      </div>)}</div>}
    </div>

    {formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80"><div className="min-h-full bg-surface-950 sm:mx-auto sm:max-w-xl"><div className="page-header"><button onClick={()=>setFormOpen(false)}><X className="h-5 w-5" /></button><h2 className="flex-1 font-bold">{editing?'Editar produto':'Novo produto'}</h2></div><div className="space-y-4 p-4"><div><label className="label">Nome *</label><input className="input" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} /></div><div><label className="label">Descricao</label><textarea className="input min-h-20" value={form.descricao || ''} onChange={e=>setForm({...form,descricao:e.target.value})} /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Categoria</label><select className="input" value={form.categoria_id} onChange={e=>setForm({...form,categoria_id:e.target.value})}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></div><div><label className="label">Preco</label><input type="number" min="0" step="0.01" className="input" value={form.preco ?? ''} onChange={e=>setForm({...form,preco:e.target.value===''?undefined:Number(e.target.value)})} /></div><div><label className="label">Marca</label><input className="input" value={form.marca || ''} onChange={e=>setForm({...form,marca:e.target.value})} /></div><div><label className="label">Modelo</label><input className="input" value={form.modelo || ''} onChange={e=>setForm({...form,modelo:e.target.value})} /></div><div><label className="label">Estoque minimo</label><input type="number" min="0" step="0.01" className="input" value={form.estoque_minimo} onChange={e=>setForm({...form,estoque_minimo:Number(e.target.value)})} /></div><div><label className="label">Unidade</label><select className="input" value={form.unidade} onChange={e=>setForm({...form,unidade:e.target.value as UnidadeMedida})}>{unidades.map(u=><option key={u}>{u}</option>)}</select></div>{!editing&&<div className="col-span-2"><label className="label">Quantidade inicial</label><input type="number" min="0" step="0.01" className="input" value={form.quantidade} onChange={e=>setForm({...form,quantidade:Number(e.target.value)})} /></div>}</div><div><label className="label">Observacoes</label><textarea className="input min-h-20" value={form.observacoes || ''} onChange={e=>setForm({...form,observacoes:e.target.value})} /></div><button disabled={saving} onClick={saveProduct} className="btn-primary w-full">Salvar produto</button></div></div></div>}

    {adjusting && <div className="fixed inset-0 z-50 flex items-end bg-black/80"><div className="w-full rounded-t-3xl bg-surface-900 p-5 sm:mx-auto sm:max-w-lg"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">{adjustMode==='add'?'Adicionar estoque':'Remover estoque'}</h2><p className="text-sm text-surface-400">{adjusting.nome} · atual {formatQuantidade(adjusting.quantidade,adjusting.unidade)}</p></div><button onClick={()=>setAdjusting(null)}><X className="h-5 w-5" /></button></div><div className="space-y-3"><input type="number" min="0.01" step="0.01" autoFocus className="input" placeholder="Quantidade" value={adjustAmount} onChange={e=>setAdjustAmount(e.target.value)} /><input className="input" placeholder="Motivo da movimentacao" value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} /><button disabled={saving} onClick={adjust} className={adjustMode==='add'?'btn-primary w-full':'btn-danger w-full'}>{adjustMode==='add'?<Plus className="h-4 w-4"/>:<Minus className="h-4 w-4"/>}{adjustMode==='add'?'Confirmar entrada':'Confirmar saida'}</button></div></div></div>}
  </div>
}
