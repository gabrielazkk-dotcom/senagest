import { supabase } from '../lib/supabase'
import { solicitarNotificacao } from '../lib/notifications'
import type { TimeEntry, TimeEntryType } from '../types'

export type PontoLocation = { latitude: number; longitude: number; accuracy: number; address?: string }

export const pontoSvc = {
  async registrar(entryType: TimeEntryType, location: PontoLocation): Promise<TimeEntry> {
    const { data, error } = await supabase.rpc('register_time_entry', {
      p_entry_type: entryType,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
      p_accuracy: location.accuracy,
      p_address: location.address || null,
    })
    if (error) throw error
    const entry = data as TimeEntry
    await solicitarNotificacao({ type: 'time_entry', entryId: entry.id })
    return entry
  },

  async listar(from: string, to: string): Promise<TimeEntry[]> {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*, user:profiles(id,nome)')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('occurred_at', { ascending: false })
    if (error) throw error
    return (data || []) as unknown as TimeEntry[]
  },
}
