'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Crosshair, Edit2, ExternalLink, MapPin, MapPinned, Navigation, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { clienteSvc } from '../../services/cliente'
import { localizacaoSvc } from '../../services/localizacao'
import type { Cliente, CreateSavedLocationDto, SavedLocation } from '../../types'

type FormState = {
  id?: string
  nome: string
  cliente_id: string
  endereco: string
  referencia: string
  latitude: number | null
  longitude: number | null
  precisao: number | null
}

const emptyForm = (): FormState => ({
  nome: '', cliente_id: '', endereco: '', referencia: '',
  latitude: null, longitude: null, precisao: null,
})

function googleMapsUrl(location: SavedLocation) {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`
}

function wazeUrl(location: SavedLocation) {
  return `https://www.waze.com/ul?ll=${location.latitude}%2C${location.longitude}&navigate=yes`
}

function locationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Permita o acesso a localizacao nas configuracoes do navegador.'
  if (error.code === error.POSITION_UNAVAILABLE) return 'O GPS nao conseguiu determinar sua localizacao.'
  if (error.code === error.TIMEOUT) return 'O GPS demorou para responder. Va para uma area aberta e tente novamente.'
  return 'Nao foi possivel obter a localizacao.'
}

export default function LocalizacoesPage() {
  const { user, isAdmin } = useAuth()
  const [locations, setLocations] = useState<SavedLocation[]>([])
  const [clients, setClients] = useState<Cliente[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [saved, customerList] = await Promise.all([
        localizacaoSvc.listar(),
        clienteSvc.getClientes(),
      ])
      setLocations(saved)
      setClients(customerList)
    } catch (error) {
      console.error(error)
      toast.error('Nao foi possivel carregar as localizacoes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return locations
    return locations.filter(location =>
      `${location.nome} ${location.cliente?.nome || ''} ${location.endereco || ''} ${location.referencia || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(term),
    )
  }, [locations, query])

  const captureCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Este aparelho nao oferece localizacao GPS.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      position => {
        setForm(current => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          precisao: position.coords.accuracy,
        }))
        setLocating(false)
        toast.success('Localizacao capturada com sucesso.')
      },
      error => {
        setLocating(false)
        toast.error(locationError(error), { duration: 7000 })
      },
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
    )
  }

  const openNew = () => {
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (location: SavedLocation) => {
    setForm({
      id: location.id,
      nome: location.nome,
      cliente_id: location.cliente_id || '',
      endereco: location.endereco || '',
      referencia: location.referencia || '',
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      precisao: location.precisao == null ? null : Number(location.precisao),
    })
    setFormOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.nome.trim()) return toast.error('Informe um nome para o local.')
    if (form.latitude == null || form.longitude == null) return toast.error('Capture a localizacao GPS antes de salvar.')
    if (!navigator.onLine) return toast.error('Conecte-se a internet para salvar a localizacao.')

    const dto: CreateSavedLocationDto = {
      nome: form.nome.trim(),
      cliente_id: form.cliente_id || undefined,
      endereco: form.endereco.trim() || undefined,
      referencia: form.referencia.trim() || undefined,
      latitude: form.latitude,
      longitude: form.longitude,
      precisao: form.precisao ?? undefined,
    }

    setSaving(true)
    try {
      if (form.id) await localizacaoSvc.atualizar(form.id, dto)
      else await localizacaoSvc.criar(dto)
      toast.success(form.id ? 'Localizacao atualizada.' : 'Localizacao salva.')
      setFormOpen(false)
      setForm(emptyForm())
      await load()
    } catch (error) {
      console.error(error)
      toast.error((error as { message?: string }).message || 'Erro ao salvar localizacao.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (location: SavedLocation) => {
    if (!confirm(`Excluir a localizacao "${location.nome}"?`)) return
    try {
      await localizacaoSvc.excluir(location.id)
      setLocations(current => current.filter(item => item.id !== location.id))
      toast.success('Localizacao excluida.')
    } catch (error) {
      console.error(error)
      toast.error('Nao foi possivel excluir a localizacao.')
    }
  }

  return <div className="animate-fade-in">
    <div className="page-header">
      <MapPinned className="h-5 w-5 text-brand-400" />
      <h1 className="flex-1 text-lg font-bold">Localizacoes</h1>
      <button onClick={openNew} className="btn-primary min-h-0 px-3 py-2 text-sm"><Plus className="h-4 w-4" />Novo</button>
    </div>

    <div className="space-y-4 p-4">
      <section className="card border-brand-500/20 bg-gradient-to-br from-brand-500/10 to-transparent">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500"><Navigation className="h-5 w-5" /></div>
          <div><p className="font-semibold">Salve locais dificeis de encontrar</p><p className="mt-1 text-xs text-surface-400">Registre o GPS enquanto estiver no local e abra a rota pelo Google Maps ou Waze quando precisar voltar.</p></div>
        </div>
      </section>

      <div className="relative">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-surface-500" />
        <input className="input pl-10" placeholder="Buscar local, cliente ou referencia" value={query} onChange={event => setQuery(event.target.value)} />
      </div>

      {loading ? <div className="card h-28 animate-pulse" /> : filtered.length === 0 ? <div className="card py-10 text-center text-surface-400">Nenhuma localizacao encontrada.</div> : <div className="space-y-3">
        {filtered.map(location => {
          const canManage = isAdmin || location.criado_por === user?.id
          return <article key={location.id} className="card space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10"><MapPin className="h-5 w-5 text-brand-400" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{location.nome}</h2>
                {location.cliente?.nome && <p className="text-xs text-brand-300">{location.cliente.nome}</p>}
                {location.endereco && <p className="mt-1 text-sm text-surface-300">{location.endereco}</p>}
                {location.referencia && <p className="mt-1 text-xs text-surface-400">Referencia: {location.referencia}</p>}
                <p className="mt-1 text-[10px] text-surface-500">{Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}{location.criador?.nome ? ` · salvo por ${location.criador.nome}` : ''}</p>
              </div>
              {canManage && <div className="flex gap-1"><button aria-label="Editar" onClick={() => openEdit(location)} className="rounded-lg p-2 text-surface-400 hover:bg-white/5 hover:text-white"><Edit2 className="h-4 w-4" /></button><button aria-label="Excluir" onClick={() => remove(location)} className="rounded-lg p-2 text-surface-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={googleMapsUrl(location)} target="_blank" rel="noreferrer" className="btn-secondary text-sm"><MapPin className="h-4 w-4" />Google Maps<ExternalLink className="h-3.5 w-3.5" /></a>
              <a href={wazeUrl(location)} target="_blank" rel="noreferrer" className="btn-primary text-sm"><Navigation className="h-4 w-4" />Waze<ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </article>
        })}
      </div>}
    </div>

    {formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80">
      <form onSubmit={save} className="min-h-full bg-surface-950 sm:mx-auto sm:max-w-xl">
        <div className="page-header"><button type="button" onClick={() => setFormOpen(false)}><X className="h-5 w-5" /></button><h2 className="flex-1 font-bold">{form.id ? 'Editar localizacao' : 'Nova localizacao'}</h2></div>
        <div className="space-y-4 p-4">
          <section className="card space-y-3">
            <div><label className="label">Nome do local *</label><input autoFocus className="input" placeholder="Ex.: Roca do seu Joao" value={form.nome} onChange={event => setForm(current => ({ ...current, nome: event.target.value }))} /></div>
            <div><label className="label">Cliente (opcional)</label><select className="input" value={form.cliente_id} onChange={event => setForm(current => ({ ...current, cliente_id: event.target.value }))}><option value="">Sem cliente vinculado</option>{clients.map(client => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></div>
            <div><label className="label">Endereco ou regiao</label><input className="input" placeholder="Ex.: Zona rural, estrada do Cedro" value={form.endereco} onChange={event => setForm(current => ({ ...current, endereco: event.target.value }))} /></div>
            <div><label className="label">Ponto de referencia</label><textarea className="input min-h-20" placeholder="Ex.: entrar depois da ponte, porteira azul" value={form.referencia} onChange={event => setForm(current => ({ ...current, referencia: event.target.value }))} /></div>
          </section>

          <section className="card space-y-3">
            <div><p className="section-title">Coordenadas GPS</p><p className="mt-1 text-xs text-surface-400">Fique no local que deseja salvar e permita o acesso ao GPS.</p></div>
            <button type="button" disabled={locating} onClick={captureCurrentLocation} className="btn-primary w-full"><Crosshair className={locating ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />{locating ? 'Obtendo localizacao...' : form.latitude == null ? 'Usar localizacao atual' : 'Capturar novamente'}</button>
            {form.latitude != null && form.longitude != null && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300"><p className="font-medium">Localizacao capturada</p><p className="mt-1 text-xs">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}{form.precisao != null ? ` · precisao aproximada de ${Math.round(form.precisao)} m` : ''}</p></div>}
          </section>

          <button type="submit" disabled={saving || locating} className="btn-primary w-full">{saving ? 'Salvando...' : 'Salvar localizacao'}</button>
        </div>
      </form>
    </div>}
  </div>
}
