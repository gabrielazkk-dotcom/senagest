'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Coffee, LogIn, LogOut, MapPin, Navigation, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { pontoSvc } from '../../services/ponto'
import { useAuth } from '../../contexts/AuthContext'
import type { TimeEntry, TimeEntryType } from '../../types'
import { cn } from '../../utils'

const labels: Record<TimeEntryType,string> = { entrada:'Entrada', saida_almoco:'Saida para almoco', retorno_almoco:'Retorno do almoco', saida:'Saida' }
const sequence: TimeEntryType[] = ['entrada','saida_almoco','retorno_almoco','saida']
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const time = (iso: string) => new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(iso))
const longDate = (key: string) => new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(`${key}T12:00:00`))

function getRange(period: 'dia'|'semana'|'mes') {
  const now = new Date(); const from = new Date(now); const to = new Date(now)
  if (period === 'semana') { const day = (now.getDay()+6)%7; from.setDate(now.getDate()-day); to.setDate(from.getDate()+6) }
  if (period === 'mes') { from.setDate(1); to.setMonth(now.getMonth()+1,0) }
  return { from: dateKey(from), to: dateKey(to) }
}

function workedMinutes(entries: TimeEntry[]) {
  const map = Object.fromEntries(entries.map(entry=>[entry.entry_type,new Date(entry.occurred_at).getTime()])) as Partial<Record<TimeEntryType,number>>
  let ms = 0
  if (map.entrada && map.saida_almoco) ms += map.saida_almoco-map.entrada
  if (map.retorno_almoco && map.saida) ms += map.saida-map.retorno_almoco
  return Math.max(0,Math.round(ms/60000))
}

export default function PontoPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<'dia'|'semana'|'mes'>('dia')
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [mapEntry, setMapEntry] = useState<TimeEntry|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const range=getRange(period); setEntries(await pontoSvc.listar(range.from,range.to)) }
    catch (error) { console.error(error); toast.error('Erro ao carregar o historico de ponto') }
    finally { setLoading(false) }
  }, [period])
  useEffect(()=>{load()},[load])

  const todayEntries = entries.filter(e=>e.user_id===user?.id&&e.work_date===dateKey(new Date())).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at))
  const nextType = sequence[todayEntries.length] || null
  const groups = useMemo(()=>entries.reduce<Record<string,TimeEntry[]>>((result,entry)=>{(result[entry.work_date]||=[]).push(entry);return result},{}),[entries])

  const getLocation = () => new Promise<GeolocationPosition>((resolve,reject)=> {
    if (!navigator.geolocation) return reject(new Error('GPS nao disponivel neste dispositivo'))
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0})
  })
  const reverseAddress = async (lat:number,lon:number) => {
    try { const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=pt-BR`); if(!response.ok)return undefined; const data=await response.json(); return data.display_name as string|undefined }
    catch { return undefined }
  }
  const register = async (type: TimeEntryType) => {
    if (type!==nextType) return
    if (!navigator.onLine) return toast.error('O ponto precisa de internet para validar horario e localizacao')
    setRegistering(true)
    try {
      const position=await getLocation(); const {latitude,longitude,accuracy}=position.coords
      const address=await reverseAddress(latitude,longitude)
      await pontoSvc.registrar(type,{latitude,longitude,accuracy,address})
      toast.success(`${labels[type]} registrada com GPS`); await load()
    } catch (error) {
      const geo=error as GeolocationPositionError
      if (geo.code===1) toast.error('Permissao de localizacao negada. Libere o GPS nas configuracoes do navegador.')
      else if (geo.code===2) toast.error('Ative a localizacao do dispositivo para registrar o ponto.')
      else toast.error((error as {message?:string}).message||'Nao foi possivel obter a localizacao')
    } finally { setRegistering(false) }
  }

  const actions: Array<{type:TimeEntryType;icon:typeof Clock3}> = [
    {type:'entrada',icon:LogIn},{type:'saida_almoco',icon:Coffee},{type:'retorno_almoco',icon:RefreshCw},{type:'saida',icon:LogOut},
  ]
  return <div className="animate-fade-in">
    <div className="page-header"><Clock3 className="h-5 w-5 text-brand-400" /><h1 className="flex-1 text-lg font-bold">Ponto</h1></div>
    <div className="space-y-5 p-4">
      <section className="card border-brand-500/20 bg-gradient-to-br from-brand-500/10 to-transparent"><div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500"><Navigation className="h-5 w-5" /></div><div><p className="font-semibold">Registro com localizacao</p><p className="text-xs text-surface-400">O horario vem do servidor e o GPS e obrigatorio. O navegador lembrara sua permissao.</p></div></div><div className="grid grid-cols-2 gap-2">{actions.map(action=>{const done=todayEntries.some(e=>e.entry_type===action.type);const active=nextType===action.type;return <button key={action.type} disabled={!active||registering} onClick={()=>register(action.type)} className={cn('flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-all',done?'border-emerald-500/20 bg-emerald-500/10 text-emerald-400':active?'border-brand-400 bg-brand-500 text-white shadow-brand':'border-white/5 bg-surface-950 text-surface-600')}><action.icon className="h-5 w-5" />{labels[action.type]}{done&&<span className="text-[10px]">{time(todayEntries.find(e=>e.entry_type===action.type)!.occurred_at)}</span>}</button>})}</div>{!nextType&&<p className="mt-4 text-center text-sm text-emerald-400">Jornada de hoje concluida.</p>}</section>

      <section><div className="mb-3 flex items-center justify-between"><div><p className="section-title mb-0">Historico</p><p className="text-xs text-surface-500">Horarios, jornada e locais registrados</p></div><CalendarDays className="h-5 w-5 text-surface-500" /></div><div className="mb-3 grid grid-cols-3 gap-2">{(['dia','semana','mes'] as const).map(value=><button key={value} onClick={()=>setPeriod(value)} className={cn('rounded-xl px-3 py-2 text-xs font-medium',period===value?'bg-brand-500 text-white':'bg-surface-800 text-surface-400')}>{value==='dia'?'Dia':value==='semana'?'Semana':'Mes'}</button>)}</div>
      {loading?<div className="card h-28 animate-pulse"/>:Object.keys(groups).length===0?<div className="card py-10 text-center text-surface-400">Nenhum registro neste periodo</div>:<div className="space-y-3">{Object.entries(groups).sort(([a],[b])=>b.localeCompare(a)).map(([day,dayEntries])=>{const minutes=workedMinutes(dayEntries);return <div key={day} className="card space-y-3"><div className="flex items-start justify-between"><div><p className="font-semibold capitalize">{longDate(day)}</p><p className="text-xs text-surface-500">{dayEntries[0]?.user?.nome}</p></div><span className="badge border-brand-500/20 bg-brand-500/10 text-brand-400">{Math.floor(minutes/60)}h {minutes%60}min</span></div><div className="grid grid-cols-2 gap-2">{dayEntries.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)).map(entry=><button key={entry.id} onClick={()=>setMapEntry(entry)} className="rounded-xl bg-surface-950 p-3 text-left"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-400"/><span className="text-xs text-surface-400">{labels[entry.entry_type]}</span></div><p className="mt-1 text-lg font-semibold">{time(entry.occurred_at).slice(0,5)}</p><p className="truncate text-[10px] text-surface-500">{entry.address||`${entry.latitude.toFixed(5)}, ${entry.longitude.toFixed(5)}`}</p></button>)}</div></div>})}</div>}
      </section>
    </div>

    {mapEntry&&<div className="fixed inset-0 z-50 flex items-end bg-black/80"><div className="w-full rounded-t-3xl bg-surface-900 p-5 sm:mx-auto sm:max-w-xl"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Local do registro</h2><p className="text-sm text-surface-400">{labels[mapEntry.entry_type]} as {time(mapEntry.occurred_at)}</p></div><button onClick={()=>setMapEntry(null)} className="text-surface-400">Fechar</button></div><iframe title="Mapa do registro" className="h-64 w-full rounded-xl border-0" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapEntry.longitude-0.005}%2C${mapEntry.latitude-0.005}%2C${mapEntry.longitude+0.005}%2C${mapEntry.latitude+0.005}&layer=mapnik&marker=${mapEntry.latitude}%2C${mapEntry.longitude}`} /><div className="mt-3 rounded-xl bg-surface-950 p-3 text-sm"><p>{mapEntry.address||'Endereco nao identificado'}</p><p className="mt-1 text-xs text-surface-500">{mapEntry.latitude.toFixed(6)}, {mapEntry.longitude.toFixed(6)} · precisao {Math.round(mapEntry.accuracy)} m</p></div></div></div>}
  </div>
}
