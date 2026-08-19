import { supabase } from '../lib/supabase'
import type { CreateSavedLocationDto, SavedLocation } from '../types'

const selectLocation = `
  *,
  cliente:clientes(id, nome),
  criador:profiles!saved_locations_criado_por_fkey(id, nome)
`

export const localizacaoSvc = {
  async listar(): Promise<SavedLocation[]> {
    const { data, error } = await supabase
      .from('saved_locations')
      .select(selectLocation)
      .order('nome')
    if (error) throw error
    return (data || []) as unknown as SavedLocation[]
  },

  async criar(dto: CreateSavedLocationDto): Promise<SavedLocation> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error('Usuario nao autenticado')

    const { data, error } = await supabase
      .from('saved_locations')
      .insert({ ...dto, cliente_id: dto.cliente_id || null, criado_por: user.id })
      .select(selectLocation)
      .single()
    if (error) throw error
    return data as unknown as SavedLocation
  },

  async atualizar(id: string, dto: CreateSavedLocationDto): Promise<SavedLocation> {
    const { data, error } = await supabase
      .from('saved_locations')
      .update({ ...dto, cliente_id: dto.cliente_id || null })
      .eq('id', id)
      .select(selectLocation)
      .single()
    if (error) throw error
    return data as unknown as SavedLocation
  },

  async excluir(id: string): Promise<void> {
    const { error } = await supabase.from('saved_locations').delete().eq('id', id)
    if (error) throw error
  },
}
