'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Download, Edit2, Eye, EyeOff, FileText, KeyRound, Plus, Search, Share2, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { clientLoginSvc, type ClientLoginInput } from '../../services/clientLogin'
import { clienteSvc } from '../../services/cliente'
import type { ClientLogin, Cliente } from '../../types'
import { brandLabel, credentialBrands, credentialPdfFileName, generateCredentialPdfBlob, inferCredentialBrand } from '../../lib/credentialPdf'

const empty = (): ClientLoginInput => ({
  cliente_id: '', empresa: '', marca: 'generico', tipo_acesso: '', sistema_equipamento: '',
  url_ip: '', usuario: '', senha: '', observacoes: '',
})

type PdfPreview = { url: string; fileName: string; records: ClientLogin[]; clientName: string }

export default function LoginsPage() {
  const [records, setRecords] = useState<ClientLogin[]>([])
  const [clients, setClients] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ClientLoginInput>(empty())
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [pdfBusy, setPdfBusy] = useState(false)
  const [preview, setPreview] = useState<PdfPreview | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, clientList] = await Promise.all([clientLoginSvc.listar(), clienteSvc.getClientes()])
      setRecords(list); setClients(clientList)
    } catch (error) { console.error(error); toast.error('Não foi possível abrir o cofre de acessos') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

  const groups = useMemo(() => {
    const term = search.toLocaleLowerCase('pt-BR')
    const filtered = records.filter(record =>
      `${record.cliente?.nome || ''} ${record.empresa || ''} ${record.tipo_acesso} ${record.sistema_equipamento} ${record.url_ip || ''} ${record.usuario}`
        .toLocaleLowerCase('pt-BR').includes(term))
    return filtered.reduce<Record<string, ClientLogin[]>>((result, record) => {
      const key = record.cliente?.nome || 'Cliente'; (result[key] ||= []).push(record); return result
    }, {})
  }, [records, search])

  const openNew = () => { setForm(empty()); setFormOpen(true) }
  const openEdit = (record: ClientLogin) => {
    setForm({
      id: record.id, cliente_id: record.cliente_id, empresa: record.empresa || '',
      marca: record.marca || inferCredentialBrand(record.empresa, record.tipo_acesso, record.sistema_equipamento),
      tipo_acesso: record.tipo_acesso, sistema_equipamento: record.sistema_equipamento,
      url_ip: record.url_ip || '', usuario: record.usuario, senha: record.senha, observacoes: record.observacoes || '',
    })
    setFormOpen(true)
  }
  const save = async () => {
    if (!form.cliente_id || !form.tipo_acesso.trim() || !form.sistema_equipamento.trim() || !form.usuario.trim() || !form.senha) return toast.error('Preencha os campos obrigatórios')
    setSaving(true)
    try { await clientLoginSvc.salvar(form); toast.success('Acesso salvo com criptografia'); setFormOpen(false); await load() }
    catch (error) { toast.error((error as { message?: string }).message || 'Erro ao salvar acesso') }
    finally { setSaving(false) }
  }
  const remove = async (record: ClientLogin) => {
    if (!confirm(`Excluir o acesso ${record.sistema_equipamento}?`)) return
    try { await clientLoginSvc.excluir(record.id); toast.success('Acesso excluído'); await load() }
    catch (error) { toast.error((error as { message?: string }).message || 'Erro ao excluir') }
  }
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copiado`) }
    catch { toast.error('Não foi possível copiar') }
  }

  const createPdf = (items: ClientLogin[], clientName: string) => ({
    blob: generateCredentialPdfBlob(items, clientName),
    fileName: credentialPdfFileName(clientName, items),
  })
  const openPdf = (items: ClientLogin[], clientName: string) => {
    setPdfBusy(true)
    try {
      const { blob, fileName } = createPdf(items, clientName)
      setPreview({ url: URL.createObjectURL(blob), fileName, records: items, clientName })
    } catch (error) { console.error(error); toast.error('Não foi possível gerar o PDF') }
    finally { setPdfBusy(false) }
  }
  const downloadPdf = (items: ClientLogin[], clientName: string) => {
    try {
      const { blob, fileName } = createPdf(items, clientName)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('PDF pronto para salvar')
    } catch (error) { console.error(error); toast.error('Não foi possível baixar o PDF') }
  }
  const sharePdf = async (items: ClientLogin[], clientName: string) => {
    try {
      const { blob, fileName } = createPdf(items, clientName)
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) return downloadPdf(items, clientName)
      await navigator.share({ title: `Acessos de ${clientName}`, text: 'Documento de acesso confidencial', files: [file] })
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') toast.error('Não foi possível compartilhar o PDF')
    }
  }
  const closePreview = () => setPreview(null)

  return <div className="animate-fade-in">
    <div className="page-header"><KeyRound className="h-5 w-5 text-brand-400" /><h1 className="flex-1 text-lg font-bold">Logins</h1><button onClick={openNew} className="btn-primary min-h-0 px-3 py-2 text-sm"><Plus className="h-4 w-4" />Acesso</button></div>
    <div className="space-y-4 p-4">
      <div className="card border-brand-500/20 bg-brand-500/5"><div className="flex gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-brand-400" /><div><p className="text-sm font-semibold">Cofre seguro de clientes</p><p className="mt-1 text-xs text-surface-400">Usuário e senha são criptografados. Os PDFs são gerados somente quando você solicita e não ficam armazenados no servidor.</p></div></div></div>
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-surface-500" /><input className="input pl-10" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, equipamento ou acesso" /></div>
      {loading ? <div className="card h-28 animate-pulse" /> : Object.keys(groups).length === 0 ? <div className="card py-10 text-center text-surface-400">Nenhum acesso cadastrado</div> : Object.entries(groups).map(([client, items]) =>
        <section key={client} className="space-y-2">
          <div className="mb-2 flex items-center gap-2"><p className="section-title mb-0 flex-1">{client}</p><button disabled={pdfBusy} onClick={()=>openPdf(items,client)} className="flex items-center gap-1.5 rounded-lg border border-brand-500/25 bg-brand-500/10 px-2.5 py-1.5 text-xs font-semibold text-brand-300"><FileText className="h-3.5 w-3.5" />PDF do cliente</button></div>
          {items.map(record => <div key={record.id} className="card space-y-3">
            <div className="flex items-start"><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><p className="font-semibold">{record.sistema_equipamento}</p><span className="badge border-white/10 bg-white/5 text-[9px] text-surface-300">{brandLabel(record.marca || inferCredentialBrand(record.empresa,record.tipo_acesso,record.sistema_equipamento))}</span></div><p className="text-xs text-surface-400">{record.tipo_acesso}{record.empresa ? ` · ${record.empresa}` : ''}</p>{record.url_ip && <a href={record.url_ip.startsWith('http')?record.url_ip:undefined} target="_blank" rel="noreferrer" className="text-xs text-brand-400">{record.url_ip}</a>}</div><button aria-label="Abrir PDF" onClick={()=>openPdf([record],client)} className="p-2 text-brand-400"><FileText className="h-4 w-4" /></button><button aria-label="Editar acesso" onClick={()=>openEdit(record)} className="p-2 text-surface-400"><Edit2 className="h-4 w-4" /></button><button aria-label="Excluir acesso" onClick={()=>remove(record)} className="p-2 text-red-400"><Trash2 className="h-4 w-4" /></button></div>
            <div className="grid gap-2 sm:grid-cols-2"><div className="flex items-center gap-2 rounded-xl bg-surface-950 p-3"><div className="min-w-0 flex-1"><p className="text-[10px] uppercase text-surface-500">Usuário</p><p className="truncate text-sm">{record.usuario}</p></div><button onClick={()=>copy(record.usuario,'Usuário')}><Copy className="h-4 w-4 text-brand-400" /></button></div><div className="flex items-center gap-2 rounded-xl bg-surface-950 p-3"><div className="min-w-0 flex-1"><p className="text-[10px] uppercase text-surface-500">Senha</p><p className="truncate font-mono text-sm">{visible[record.id]?record.senha:'••••••••'}</p></div><button onClick={()=>setVisible(value=>({...value,[record.id]:!value[record.id]}))}>{visible[record.id]?<EyeOff className="h-4 w-4 text-surface-400"/>:<Eye className="h-4 w-4 text-surface-400"/>}</button><button onClick={()=>copy(record.senha,'Senha')}><Copy className="h-4 w-4 text-brand-400" /></button></div></div>
            {record.observacoes && <p className="text-xs text-surface-400">{record.observacoes}</p>}
          </div>)}
        </section>)}
    </div>

    {formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80"><div className="min-h-full bg-surface-950 sm:mx-auto sm:max-w-xl"><div className="page-header"><button onClick={()=>setFormOpen(false)}><X className="h-5 w-5" /></button><h2 className="flex-1 font-bold">{form.id?'Editar acesso':'Novo acesso'}</h2></div><div className="space-y-4 p-4">
      <div><label className="label">Cliente *</label><select className="input" value={form.cliente_id} onChange={e=>setForm({...form,cliente_id:e.target.value})}><option value="">Selecione</option>{clients.map(client=><option key={client.id} value={client.id}>{client.nome}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="label">Empresa</label><input className="input" value={form.empresa || ''} onChange={e=>setForm({...form,empresa:e.target.value})} /></div><div><label className="label">Marca do equipamento</label><select className="input" value={form.marca || 'generico'} onChange={e=>setForm({...form,marca:e.target.value as ClientLoginInput['marca']})}>{credentialBrands.map(brand=><option key={brand.value} value={brand.value}>{brand.label}</option>)}</select></div></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="label">Tipo de acesso *</label><input className="input" placeholder="Câmera, DVR, roteador..." value={form.tipo_acesso} onChange={e=>setForm({...form,tipo_acesso:e.target.value})} /></div><div><label className="label">Sistema/equipamento *</label><input className="input" value={form.sistema_equipamento} onChange={e=>setForm({...form,sistema_equipamento:e.target.value})} /></div></div>
      <div><label className="label">URL ou IP</label><input className="input" placeholder="https:// ou 192.168..." value={form.url_ip || ''} onChange={e=>setForm({...form,url_ip:e.target.value})} /></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="label">Usuário *</label><input className="input" autoComplete="off" value={form.usuario} onChange={e=>setForm({...form,usuario:e.target.value})} /></div><div><label className="label">Senha *</label><input className="input" type="password" autoComplete="new-password" value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} /></div></div>
      <div><label className="label">Observações</label><textarea className="input min-h-24" value={form.observacoes || ''} onChange={e=>setForm({...form,observacoes:e.target.value})} /></div><button disabled={saving} onClick={save} className="btn-primary w-full">Salvar no cofre</button>
    </div></div></div>}

    {preview && <div className="fixed inset-0 z-[60] flex flex-col bg-surface-950"><div className="safe-top flex items-center gap-2 border-b border-white/10 p-3"><button aria-label="Fechar PDF" onClick={closePreview} className="rounded-xl p-2 text-surface-300"><X className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{preview.fileName}</p><p className="text-[10px] text-surface-500">Pré-visualização confidencial</p></div><button onClick={()=>downloadPdf(preview.records,preview.clientName)} className="rounded-xl bg-surface-800 p-2.5 text-surface-200" aria-label="Baixar PDF"><Download className="h-5 w-5" /></button><button onClick={()=>sharePdf(preview.records,preview.clientName)} className="rounded-xl bg-brand-500 p-2.5 text-white" aria-label="Compartilhar PDF"><Share2 className="h-5 w-5" /></button></div><iframe title="Pré-visualização do PDF" src={preview.url} className="min-h-0 flex-1 bg-white" /></div>}
  </div>
}
