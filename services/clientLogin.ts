import { supabase } from '../lib/supabase'
import type { ClientLogin } from '../types'

export type ClientLoginInput = Omit<ClientLogin, 'id' | 'cliente' | 'created_at' | 'updated_at'> & { id?: string }

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('client-logins', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export const clientLoginSvc = {
  async listar(): Promise<ClientLogin[]> {
    const result = await invoke({ action: 'list' })
    return result?.data || []
  },
  async salvar(input: ClientLoginInput): Promise<void> {
    await invoke({ action: 'save', ...input })
  },
  async excluir(id: string): Promise<void> {
    await invoke({ action: 'delete', id })
  },
}
