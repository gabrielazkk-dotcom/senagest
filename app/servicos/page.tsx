'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, Camera, CheckCircle2, Clock3, Download, Edit2, FileText, Package, Plus, RefreshCw, RotateCcw, Search, Share2, Trash2, Video, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { clienteSvc } from '../../services/cliente'
import { servicoSvc, type ServicoItemInput, type ServicoResumo, type ServicoStatus } from '../../services/servico'
import { estoqueSvc } from '../../estoque'
import { useAuth } from '../../contexts/AuthContext'
import type { Categoria, Cliente, CreateProdutoDto, ProdutoComStatus, UnidadeMedida } from '../../types'
import { cn, formatDate, formatQuantidade } from '../../utils'
import { supabase } from '../../lib/supabase'
import { adicionarPendenteServico } from '../../lib/offlineQueue'
import { pareceErroDeRede } from '../../lib/offlineSync'
import { generateServicePdfBlob, servicePdfFileName } from '../../lib/servicePdf'

type FormState = {
  id?: string
  cliente: Cliente | null
  clienteNome: string
  clienteTelefone: string
  clienteCpf: string
  clienteEmail: string
  clienteEndereco: string
  clienteCidade: string
  clienteObservacoes: string
  descricao: string
  observacoes: string
  fotosUrls: string[]
  videosUrls: string[]
  itens: ServicoItemInput[]
}

const MAX_VIDEO_SIZE = 50 * 1024 * 1024
const emptyForm = (): FormState => ({ cliente: null, clienteNome: '', clienteTelefone: '', clienteCpf: '', clienteEmail: '', clienteEndereco: '', clienteCidade: '', clienteObservacoes: '', descricao: '', observacoes: '', fotosUrls: [], videosUrls: [], itens: [] })
const emptyProduct = (): CreateProdutoDto => ({ nome: '', categoria_id: '', marca: '', modelo: '', descricao: '', preco: undefined, quantidade: 1, estoque_minimo: 1, unidade: 'un', observacoes: '' })
const units: UnidadeMedida[] = ['un', 'pç', 'm', 'cx', 'rolo', 'par', 'kit']
type PdfPreview = { url: string; fileName: string; blob: Blob }

export default function ServicosPage() {
  const { profile } = useAuth()
  const [servicos, setServicos] = useState<ServicoResumo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<ProdutoComStatus[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'todos' | ServicoStatus>('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<ServicoResumo | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [clientSearch, setClientSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [newPhotos, setNewPhotos] = useState<File[]>([])
  const [newVideos, setNewVideos] = useState<File[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null)
  const [productFormOpen, setProductFormOpen] = useState(false)
  const [productSaving, setProductSaving] = useState(false)
  const [productForm, setProductForm] = useState<CreateProdutoDto>(emptyProduct())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [servicesData, clientsData, productsData, categoriesData] = await Promise.all([
        servicoSvc.getServicos(), clienteSvc.getClientes(), estoqueSvc.getProdutos(), estoqueSvc.getCategorias(),
      ])
      setServicos(servicesData); setClientes(clientsData); setProdutos(productsData); setCategorias(categoriesData)
      return servicesData
    } catch (error) {
      console.error(error); toast.error('Nao foi possivel carregar os servicos')
      return []
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (pdfPreview) URL.revokeObjectURL(pdfPreview.url) }, [pdfPreview])

  const filtered = useMemo(() => servicos.filter(service => {
    const haystack = `${service.cliente?.nome || ''} ${service.descricao} ${service.tecnico?.nome || ''}`.toLocaleLowerCase('pt-BR')
    return (status === 'todos' || service.status === status) && haystack.includes(query.toLocaleLowerCase('pt-BR'))
  }), [servicos, status, query])
  const visibleClients = clientes.filter(c => c.nome.toLocaleLowerCase('pt-BR').includes(clientSearch.toLocaleLowerCase('pt-BR'))).slice(0, 6)
  const visibleProducts = produtos.filter(p => p.nome.toLocaleLowerCase('pt-BR').includes(productSearch.toLocaleLowerCase('pt-BR'))).slice(0, 8)

  const openNew = () => { setForm(emptyForm()); setNewPhotos([]); setNewVideos([]); setClientSearch(''); setProductSearch(''); setFormOpen(true) }
  const openEdit = (service: ServicoResumo) => {
    if (service.status !== 'em_andamento') return
    setForm({
      id: service.id, cliente: service.cliente || null, clienteNome: '', clienteTelefone: '', clienteCpf: '', clienteEmail: '', clienteEndereco: '', clienteCidade: '', clienteObservacoes: '',
      descricao: service.descricao, observacoes: service.observacoes || '', fotosUrls: service.fotos_urls,
      videosUrls: service.videos_urls,
      itens: service.itens.map(item => {
        const product = produtos.find(p => p.id === item.produto_id) || item.produto
        if (!product) throw new Error(`Produto ${item.produto_nome} nao esta disponivel`)
        return { produto: product, quantidade: item.quantidade, observacao: item.observacao }
      }),
    })
    setNewPhotos([]); setNewVideos([]); setClientSearch(service.cliente?.nome || ''); setProductSearch(''); setDetail(null); setFormOpen(true)
  }

  const addProduct = (product: ProdutoComStatus) => {
    if (product.quantidade <= 0) return toast.error('Produto sem estoque')
    setForm(current => {
      const found = current.itens.find(item => item.produto.id === product.id)
      const itens = found
        ? current.itens.map(item => item.produto.id === product.id ? { ...item, quantidade: Math.min(item.quantidade + 1, product.quantidade) } : item)
        : [...current.itens, { produto: product, quantidade: 1 }]
      return { ...current, itens }
    })
    setProductSearch('')
  }

  const setItem = (index: number, patch: Partial<ServicoItemInput>) => setForm(current => ({
    ...current,
    itens: current.itens.map((item, i) => i === index ? { ...item, ...patch } : item),
  }))

  const validate = () => {
    if (!form.cliente && !form.clienteNome.trim()) throw new Error('Informe ou selecione o cliente')
    if (!form.cliente && form.clienteCpf && form.clienteCpf.replace(/\D/g, '').length !== 11) throw new Error('CPF deve possuir 11 digitos')
    if (!form.cliente && form.clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clienteEmail)) throw new Error('Informe um e-mail valido')
    if (!form.descricao.trim()) throw new Error('Descreva o servico')
    if (!form.itens.length) throw new Error('Adicione pelo menos um produto')
    for (const item of form.itens) {
      if (item.quantidade <= 0 || item.quantidade > item.produto.quantidade) throw new Error(`Revise a quantidade de ${item.produto.nome}`)
    }
    if (!profile) throw new Error('Perfil nao encontrado. Refaça o login.')
  }

  const uploadMedia = async () => {
    const photos = [...form.fotosUrls]
    const videos = [...form.videosUrls]
    for (const file of newPhotos) {
      const extension = file.name.split('.').pop() || 'jpg'
      const path = `servicos/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('fotos-servicos').upload(path, file)
      if (error) throw error
      photos.push(supabase.storage.from('fotos-servicos').getPublicUrl(path).data.publicUrl)
    }
    for (const file of newVideos) {
      const extension = file.name.split('.').pop() || 'mp4'
      const path = `servicos/videos/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('fotos-servicos').upload(path, file, {
        contentType: file.type || 'video/mp4',
      })
      if (error) throw error
      videos.push(supabase.storage.from('fotos-servicos').getPublicUrl(path).data.publicUrl)
    }
    return { photos, videos }
  }

  const selectVideos = (files: FileList | null) => {
    const selected = Array.from(files || [])
    const oversized = selected.find(file => file.size > MAX_VIDEO_SIZE)
    if (oversized) {
      toast.error(`${oversized.name} ultrapassa o limite de 50 MB. Grave um video mais curto.`)
      return
    }
    setNewVideos(selected)
  }

  const createProductInline = async () => {
    if (!productForm.nome.trim()) return toast.error('Informe o nome do produto.')
    if (productForm.quantidade <= 0) return toast.error('Informe um estoque inicial maior que zero para usar o produto neste servico.')
    if (productForm.estoque_minimo < 0 || (productForm.preco != null && productForm.preco < 0)) return toast.error('Os valores nao podem ser negativos.')
    if (!navigator.onLine) return toast.error('Conecte-se a internet para cadastrar um produto.')

    setProductSaving(true)
    try {
      const created = await estoqueSvc.createProduto({ ...productForm, nome: productForm.nome.trim(), categoria_id: productForm.categoria_id || undefined })
      const refreshed = await estoqueSvc.getProdutos()
      setProdutos(refreshed)
      const available = refreshed.find(product => product.id === created.id)
      if (!available) throw new Error('Produto criado, mas nao foi possivel adiciona-lo ao servico.')
      addProduct(available)
      setProductForm(emptyProduct())
      setProductFormOpen(false)
      toast.success('Produto criado e adicionado ao servico.')
    } catch (error) {
      console.error(error)
      toast.error((error as { message?: string }).message || 'Erro ao cadastrar produto.')
    } finally {
      setProductSaving(false)
    }
  }

  const save = async (finalize: boolean) => {
    try { validate() } catch (error) { toast.error((error as Error).message); return }
    setSaving(true)
    try {
      if (!navigator.onLine) {
        if (!finalize || form.id) throw new Error('Para editar ou salvar em andamento, conecte-se a internet')
        await adicionarPendenteServico({
          clienteId: form.cliente?.id, clienteNome: form.clienteNome, clienteTelefone: form.clienteTelefone,
          clienteCpf: form.clienteCpf, clienteEmail: form.clienteEmail, clienteEndereco: form.clienteEndereco, clienteCidade: form.clienteCidade, clienteObservacoes: form.clienteObservacoes,
          descricao: form.descricao, itens: form.itens,
        }, newPhotos, newVideos)
        toast.success('Servico salvo no aparelho e sera enviado quando a conexao voltar')
      } else {
        const media = await uploadMedia()
        const id = await servicoSvc.salvarServico({
          id: form.id, cliente: form.cliente, clienteNome: form.clienteNome, clienteTelefone: form.clienteTelefone, clienteCpf: form.clienteCpf, clienteEmail: form.clienteEmail, clienteEndereco: form.clienteEndereco, clienteCidade: form.clienteCidade, clienteObservacoes: form.clienteObservacoes,
          descricao: form.descricao, observacoes: form.observacoes, fotos_urls: media.photos, videos_urls: media.videos, itens: form.itens,
        })
        if (finalize) await servicoSvc.finalizarServico(id)
        toast.success(finalize ? 'Servico finalizado e estoque atualizado' : 'Servico salvo em andamento')
      }
      setFormOpen(false); setForm(emptyForm()); setNewPhotos([]); setNewVideos([]); await load()
    } catch (error) {
      if (finalize && !form.id && pareceErroDeRede(error)) {
        try {
          await adicionarPendenteServico({ clienteId: form.cliente?.id, clienteNome: form.clienteNome, clienteTelefone: form.clienteTelefone, clienteCpf: form.clienteCpf, clienteEmail: form.clienteEmail, clienteEndereco: form.clienteEndereco, clienteCidade: form.clienteCidade, clienteObservacoes: form.clienteObservacoes, descricao: form.descricao, itens: form.itens }, newPhotos, newVideos)
          setFormOpen(false); toast.success('Sem internet: servico salvo no aparelho')
          return
        } catch { /* exibe o erro original */ }
      }
      console.error(error); toast.error((error as { message?: string }).message || 'Erro ao salvar servico')
    } finally { setSaving(false) }
  }

  const reopen = async (service: ServicoResumo) => {
    if (!confirm('Reabrir este servico? Os produtos serao devolvidos ao estoque e todos os dados serao preservados.')) return
    setSaving(true)
    try {
      await servicoSvc.reabrirServico(service.id)
      const updated = await load()
      toast.success('Servico reaberto e disponivel para edicao')
      const reopened = updated.find(item => item.id === service.id)
      if (reopened) openEdit(reopened)
    } catch (error) { console.error(error); toast.error((error as { message?: string }).message || 'Erro ao reabrir servico') }
    finally { setSaving(false) }
  }

  const finalizeExisting = async (service: ServicoResumo) => {
    if (!confirm('Finalizar o servico e baixar os produtos do estoque?')) return
    setSaving(true)
    try { await servicoSvc.finalizarServico(service.id); toast.success('Servico finalizado'); setDetail(null); await load() }
    catch (error) { toast.error((error as { message?: string }).message || 'Erro ao finalizar') }
    finally { setSaving(false) }
  }

  const openServicePdf = async (service: ServicoResumo) => {
    setPdfBusy(true)
    toast.loading('Montando PDF e carregando fotos...', { id: 'service-pdf' })
    try {
      const blob = await generateServicePdfBlob(service)
      const fileName = servicePdfFileName(service)
      setPdfPreview({ blob, fileName, url: URL.createObjectURL(blob) })
      toast.success('PDF pronto.', { id: 'service-pdf' })
    } catch (error) {
      console.error(error)
      toast.error('Nao foi possivel gerar o PDF do servico.', { id: 'service-pdf' })
    } finally {
      setPdfBusy(false)
    }
  }

  const downloadPdf = () => {
    if (!pdfPreview) return
    const anchor = document.createElement('a')
    anchor.href = pdfPreview.url
    anchor.download = pdfPreview.fileName
    anchor.click()
    toast.success('PDF pronto para salvar.')
  }

  const sharePdf = async () => {
    if (!pdfPreview) return
    try {
      const file = new File([pdfPreview.blob], pdfPreview.fileName, { type: 'application/pdf' })
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) return downloadPdf()
      await navigator.share({ title: 'Relatorio de servico', text: 'Relatorio tecnico gerado pelo SenaGest', files: [file] })
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') toast.error('Nao foi possivel compartilhar o PDF.')
    }
  }

  return <div className="animate-fade-in">
    <div className="page-header"><BriefcaseBusiness className="h-5 w-5 text-brand-400" /><h1 className="flex-1 text-lg font-bold">Servicos</h1><button onClick={openNew} className="btn-primary min-h-0 px-3 py-2 text-sm"><Plus className="h-4 w-4" />Novo</button></div>
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card"><Clock3 className="h-5 w-5 text-amber-400" /><strong className="text-2xl">{servicos.filter(s => s.status === 'em_andamento').length}</strong><span className="text-sm text-surface-400">Em andamento</span></div>
        <div className="stat-card"><CheckCircle2 className="h-5 w-5 text-emerald-400" /><strong className="text-2xl">{servicos.filter(s => s.status === 'finalizado').length}</strong><span className="text-sm text-surface-400">Finalizados</span></div>
      </div>
      <div className="card space-y-3">
        <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-surface-500" /><input className="input pl-10" placeholder="Buscar cliente, descricao ou tecnico" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="flex gap-2 overflow-x-auto">{(['todos','em_andamento','finalizado'] as const).map(value => <button key={value} onClick={() => setStatus(value)} className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-xs', status === value ? 'bg-brand-500 text-white' : 'bg-surface-900 text-surface-400')}>{value === 'todos' ? 'Todos' : value === 'em_andamento' ? 'Em andamento' : 'Finalizados'}</button>)}</div>
      </div>
      {loading ? <div className="card h-28 animate-pulse" /> : filtered.length === 0 ? <div className="card py-10 text-center text-surface-400">Nenhum servico encontrado</div> : <div className="space-y-3">{filtered.map(service => <button key={service.id} onClick={() => setDetail(service)} className="card w-full space-y-3 text-left hover:border-brand-500/30">
        <div className="flex gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10"><BriefcaseBusiness className="h-5 w-5 text-brand-400" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{service.cliente?.nome || 'Sem cliente'}</p><p className="truncate text-sm text-surface-400">{service.descricao}</p><p className="text-xs text-surface-500">{formatDate(service.created_at)}</p></div><span className={cn('badge h-fit', service.status === 'finalizado' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-400')}>{service.status === 'finalizado' ? 'Finalizado' : 'Em andamento'}</span></div>
        <div className="flex flex-wrap gap-2">{service.itens.map(item => <span key={item.id} className="rounded-lg bg-surface-900 px-2.5 py-1.5 text-xs text-surface-300">{item.produto_nome} · {formatQuantidade(item.quantidade, item.unidade)}</span>)}</div>
      </button>)}</div>}
      <button onClick={() => load()} className="btn-secondary w-full text-sm"><RefreshCw className="h-4 w-4" />Atualizar</button>
    </div>

    {detail && <div className="fixed inset-0 z-50 flex items-end bg-black/80"><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-surface-900 p-5"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Detalhes do servico</h2><button onClick={() => setDetail(null)}><X className="h-5 w-5" /></button></div><div className="space-y-4">
      <div><p className="label">Cliente</p><p>{detail.cliente?.nome}</p></div><div><p className="label">Descricao</p><p>{detail.descricao}</p></div>{detail.observacoes && <div><p className="label">Observacoes</p><p>{detail.observacoes}</p></div>}
      <div><p className="label">Produtos</p><div className="space-y-2">{detail.itens.map(item => <div key={item.id} className="flex justify-between rounded-xl bg-surface-950 p-3 text-sm"><span>{item.produto_nome}</span><strong>{formatQuantidade(item.quantidade,item.unidade)}</strong></div>)}</div></div>
      {detail.fotos_urls.length > 0 && <div><p className="label">Fotos</p><div className="mt-2 flex gap-2 overflow-x-auto">{detail.fotos_urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto do servico" className="h-24 w-28 rounded-xl object-cover" /></a>)}</div></div>}
      {detail.videos_urls.length > 0 && <div><p className="label">Videos</p><div className="mt-2 grid gap-3 sm:grid-cols-2">{detail.videos_urls.map(url => <video key={url} src={url} controls playsInline preload="metadata" className="max-h-64 w-full rounded-xl bg-black" />)}</div></div>}
      <div className="grid gap-2 sm:grid-cols-2"><button disabled={pdfBusy} onClick={() => openServicePdf(detail)} className="btn-secondary"><FileText className="h-4 w-4" />{pdfBusy ? 'Gerando PDF...' : 'Gerar PDF'}</button>{detail.status === 'finalizado' ? <button disabled={saving} onClick={() => reopen(detail)} className="btn-primary"><RotateCcw className="h-4 w-4" />Reabrir servico</button> : <><button onClick={() => openEdit(detail)} className="btn-secondary"><Edit2 className="h-4 w-4" />Editar</button><button disabled={saving} onClick={() => finalizeExisting(detail)} className="btn-primary"><CheckCircle2 className="h-4 w-4" />Finalizar</button></>}</div>
    </div></div></div>}

    {formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80"><div className="min-h-full bg-surface-950 sm:mx-auto sm:max-w-2xl"><div className="page-header"><button onClick={() => setFormOpen(false)}><X className="h-5 w-5" /></button><h2 className="flex-1 font-bold">{form.id ? 'Editar servico' : 'Novo servico'}</h2></div><div className="space-y-5 p-4">
      <section className="card space-y-3"><p className="section-title">Cliente</p>{form.cliente ? <div className="flex items-center justify-between rounded-xl bg-surface-950 p-3"><div><span>{form.cliente.nome}</span>{form.cliente.telefone && <p className="text-xs text-surface-500">{form.cliente.telefone}</p>}</div><button onClick={() => setForm(current => ({...current, cliente:null}))} className="text-sm text-brand-400">Trocar</button></div> : <><input className="input" placeholder="Buscar cliente" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />{clientSearch && <div className="space-y-1">{visibleClients.map(client => <button key={client.id} onClick={() => { setForm(current => ({...current,cliente:client,clienteNome:''})); setClientSearch(client.nome) }} className="w-full rounded-xl bg-surface-950 p-3 text-left text-sm">{client.nome}</button>)}</div>}<div><p className="text-xs font-medium text-surface-300">Ou cadastre rapidamente</p><p className="text-[10px] text-surface-500">Somente o nome e obrigatorio.</p></div><div><label className="label">Nome *</label><input className="input" placeholder="Nome do novo cliente" value={form.clienteNome} onChange={e => setForm(current => ({...current,clienteNome:e.target.value}))} /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Telefone</label><input className="input" inputMode="tel" placeholder="(00) 00000-0000" value={form.clienteTelefone} onChange={e => setForm(current => ({...current,clienteTelefone:e.target.value}))} /></div><div><label className="label">CPF</label><input className="input" inputMode="numeric" placeholder="000.000.000-00" value={form.clienteCpf} onChange={e => setForm(current => ({...current,clienteCpf:e.target.value}))} /></div></div><div><label className="label">E-mail</label><input type="email" className="input" placeholder="cliente@email.com" value={form.clienteEmail} onChange={e => setForm(current => ({...current,clienteEmail:e.target.value}))} /></div><div><label className="label">Endereco</label><input className="input" placeholder="Rua, numero e bairro" value={form.clienteEndereco} onChange={e => setForm(current => ({...current,clienteEndereco:e.target.value}))} /></div><div><label className="label">Cidade</label><input className="input" value={form.clienteCidade} onChange={e => setForm(current => ({...current,clienteCidade:e.target.value}))} /></div><div><label className="label">Observacoes do cliente</label><textarea className="input min-h-20" placeholder="Referencia, propriedade rural, contato alternativo..." value={form.clienteObservacoes} onChange={e => setForm(current => ({...current,clienteObservacoes:e.target.value}))} /></div></>}</section>
      <section className="card space-y-3"><p className="section-title">Dados do servico</p><textarea className="input min-h-24" placeholder="Descricao do servico" value={form.descricao} onChange={e => setForm(current => ({...current,descricao:e.target.value}))} /><textarea className="input min-h-20" placeholder="Observacoes (opcional)" value={form.observacoes} onChange={e => setForm(current => ({...current,observacoes:e.target.value}))} /></section>
      <section className="card space-y-3"><div className="flex items-center gap-2"><p className="section-title mb-0 flex-1">Produtos utilizados</p><button type="button" onClick={() => { setProductForm(emptyProduct()); setProductFormOpen(true) }} className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-2.5 py-1.5 text-xs font-semibold text-brand-300"><Plus className="mr-1 inline h-3.5 w-3.5" />Criar produto</button></div><input className="input" placeholder="Pesquisar produto do estoque" value={productSearch} onChange={e => setProductSearch(e.target.value)} />{productSearch && <div className="space-y-1">{visibleProducts.map(product => <button key={product.id} disabled={product.quantidade <= 0} onClick={() => addProduct(product)} className="flex w-full items-center justify-between rounded-xl bg-surface-950 p-3 text-left text-sm disabled:opacity-40"><span>{product.nome}</span><span className="text-surface-400">{formatQuantidade(product.quantidade,product.unidade)}</span></button>)}</div>}
      <div className="space-y-2">{form.itens.map((item,index) => <div key={item.produto.id} className="rounded-xl border border-white/10 bg-surface-950 p-3"><div className="mb-2 flex items-center gap-2"><Package className="h-4 w-4 text-brand-400" /><span className="flex-1 text-sm font-medium">{item.produto.nome}</span><button onClick={() => setForm(current => ({...current,itens:current.itens.filter((_,i)=>i!==index)}))}><Trash2 className="h-4 w-4 text-red-400" /></button></div><div className="grid grid-cols-3 gap-2"><input type="number" min="0.01" step="0.01" max={item.produto.quantidade} className="input col-span-1" value={item.quantidade} onChange={e => setItem(index,{quantidade:Number(e.target.value)})} /><input className="input col-span-2" placeholder="Observacao do item" value={item.observacao || ''} onChange={e => setItem(index,{observacao:e.target.value})} /></div></div>)}</div></section>
      <section className="card space-y-4"><div><p className="section-title">Fotos e videos</p><p className="mt-1 text-xs text-surface-400">Use a camera ou escolha arquivos da galeria. Cada video pode ter ate 50 MB.</p></div><div className="grid grid-cols-2 gap-2"><label className="btn-secondary cursor-pointer"><Camera className="h-4 w-4" />Adicionar fotos<input type="file" accept="image/*" multiple className="hidden" onChange={e => setNewPhotos(Array.from(e.target.files || []))} /></label><label className="btn-secondary cursor-pointer"><Video className="h-4 w-4" />Adicionar videos<input type="file" accept="video/*" multiple className="hidden" onChange={e => selectVideos(e.target.files)} /></label></div><div className="grid grid-cols-2 gap-2 text-xs text-surface-400"><p>{form.fotosUrls.length + newPhotos.length} foto(s)</p><p>{form.videosUrls.length + newVideos.length} video(s)</p></div>{newVideos.length > 0 && <div className="space-y-2">{newVideos.map((file,index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl bg-surface-950 p-3 text-xs"><Video className="h-4 w-4 shrink-0 text-brand-400" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-surface-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" aria-label="Remover video" onClick={() => setNewVideos(current => current.filter((_,i) => i !== index))}><X className="h-4 w-4 text-red-400" /></button></div>)}</div>}</section>
      <div className="grid gap-2 pb-8 sm:grid-cols-2"><button disabled={saving} onClick={() => save(false)} className="btn-secondary">Salvar em andamento</button><button disabled={saving} onClick={() => save(true)} className="btn-primary"><CheckCircle2 className="h-4 w-4" />Finalizar servico</button></div>
    </div></div></div>}

    {productFormOpen && <div className="fixed inset-0 z-[65] overflow-y-auto bg-black/85"><div className="min-h-full bg-surface-950 sm:mx-auto sm:max-w-xl"><div className="page-header"><button type="button" onClick={() => setProductFormOpen(false)}><X className="h-5 w-5" /></button><div className="flex-1"><h2 className="font-bold">Criar produto</h2><p className="text-[10px] text-surface-500">O produto sera salvo no estoque e adicionado ao servico.</p></div></div><div className="space-y-4 p-4"><section className="card space-y-3"><div><label className="label">Nome *</label><input autoFocus className="input" value={productForm.nome} onChange={e => setProductForm(current => ({...current,nome:e.target.value}))} /></div><div><label className="label">Descricao</label><textarea className="input min-h-20" value={productForm.descricao || ''} onChange={e => setProductForm(current => ({...current,descricao:e.target.value}))} /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Categoria</label><select className="input" value={productForm.categoria_id || ''} onChange={e => setProductForm(current => ({...current,categoria_id:e.target.value}))}><option value="">Sem categoria</option>{categorias.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div><div><label className="label">Unidade</label><select className="input" value={productForm.unidade} onChange={e => setProductForm(current => ({...current,unidade:e.target.value as UnidadeMedida}))}>{units.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></div><div><label className="label">Marca</label><input className="input" value={productForm.marca || ''} onChange={e => setProductForm(current => ({...current,marca:e.target.value}))} /></div><div><label className="label">Modelo</label><input className="input" value={productForm.modelo || ''} onChange={e => setProductForm(current => ({...current,modelo:e.target.value}))} /></div><div><label className="label">Quantidade inicial *</label><input type="number" min="0.01" step="0.01" className="input" value={productForm.quantidade} onChange={e => setProductForm(current => ({...current,quantidade:Number(e.target.value)}))} /></div><div><label className="label">Estoque minimo</label><input type="number" min="0" step="0.01" className="input" value={productForm.estoque_minimo} onChange={e => setProductForm(current => ({...current,estoque_minimo:Number(e.target.value)}))} /></div></div><div><label className="label">Preco</label><input type="number" min="0" step="0.01" className="input" value={productForm.preco ?? ''} onChange={e => setProductForm(current => ({...current,preco:e.target.value === '' ? undefined : Number(e.target.value)}))} /></div><div><label className="label">Observacoes</label><textarea className="input min-h-20" value={productForm.observacoes || ''} onChange={e => setProductForm(current => ({...current,observacoes:e.target.value}))} /></div></section><button type="button" disabled={productSaving} onClick={createProductInline} className="btn-primary w-full">{productSaving ? 'Criando produto...' : 'Criar e adicionar ao servico'}</button></div></div></div>}

    {pdfPreview && <div className="fixed inset-0 z-[60] flex flex-col bg-surface-950"><div className="safe-top flex items-center gap-2 border-b border-white/10 p-3"><button aria-label="Fechar PDF" onClick={() => setPdfPreview(null)} className="rounded-xl p-2 text-surface-300"><X className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{pdfPreview.fileName}</p><p className="text-[10px] text-surface-500">Relatorio tecnico do servico</p></div><button onClick={downloadPdf} className="rounded-xl bg-surface-800 p-2.5 text-surface-200" aria-label="Baixar PDF"><Download className="h-5 w-5" /></button><button onClick={sharePdf} className="rounded-xl bg-brand-500 p-2.5 text-white" aria-label="Compartilhar PDF"><Share2 className="h-5 w-5" /></button></div><iframe title="Pre-visualizacao do PDF" src={pdfPreview.url} className="min-h-0 flex-1 bg-white" /></div>}
  </div>
}
