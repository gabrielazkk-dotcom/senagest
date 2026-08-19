import { supabase } from '../lib/supabase'
import { Cliente, CreateClienteDto } from '../types'
import { offlineData } from '../lib/offlineData'

export const clienteSvc = {
  async getClientes(search?: string): Promise<Cliente[]> {
    let query = supabase
      .from('clientes')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (search) query = query.ilike('nome', `%${search}%`)

    try {
      const { data, error } = await query
      if (error) throw error
      const clientes = data || []
      await offlineData.setClientes(clientes, !search)
      return clientes
    } catch (error) {
      const cache = await offlineData.getClientes()
      if (!cache) throw error
      const termo = search?.trim().toLocaleLowerCase('pt-BR')
      return termo
        ? cache.filter(cliente => cliente.nome.toLocaleLowerCase('pt-BR').includes(termo))
        : cache
    }
  },

  async createCliente(dto: CreateClienteDto): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .insert(dto)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateCliente(id: string, dto: Partial<CreateClienteDto>): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .update(dto)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
