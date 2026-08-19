import type { User } from '@supabase/supabase-js'
import type { Cliente, ProdutoComStatus, Profile } from '../types'

const DB_NAME = 'senagest-offline-data'
const DB_VERSION = 1
const STORE_NAME = 'cache'

type CacheKey = 'user' | 'profile' | 'clientes' | 'produtos'

type CacheEntry<T> = {
  key: CacheKey
  value: T
  updatedAt: string
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function salvar<T>(key: CacheKey, value: T): Promise<void> {
  const db = await abrirDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ key, value, updatedAt: new Date().toISOString() } satisfies CacheEntry<T>)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function ler<T>(key: CacheKey): Promise<T | null> {
  try {
    const db = await abrirDB()
    const entry = await new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as CacheEntry<T> | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return entry?.value ?? null
  } catch {
    return null
  }
}

async function remover(key: CacheKey): Promise<void> {
  try {
    const db = await abrirDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Cache é auxiliar; uma falha local não deve bloquear o logout.
  }
}

function mesclarPorId<T extends { id: string }>(atuais: T[], novos: T[]): T[] {
  const mapa = new Map(atuais.map(item => [item.id, item]))
  novos.forEach(item => mapa.set(item.id, item))
  return Array.from(mapa.values())
}

export const offlineData = {
  getUser: () => ler<User>('user'),
  setUser: (user: User) => salvar('user', user),
  clearUser: () => remover('user'),

  getProfile: () => ler<Profile>('profile'),
  setProfile: (profile: Profile) => salvar('profile', profile),
  clearProfile: () => remover('profile'),

  getClientes: () => ler<Cliente[]>('clientes'),
  async setClientes(clientes: Cliente[], replace = true) {
    const value = replace ? clientes : mesclarPorId((await ler<Cliente[]>('clientes')) ?? [], clientes)
    await salvar('clientes', value)
  },

  getProdutos: () => ler<ProdutoComStatus[]>('produtos'),
  async setProdutos(produtos: ProdutoComStatus[], replace = true) {
    const value = replace ? produtos : mesclarPorId((await ler<ProdutoComStatus[]>('produtos')) ?? [], produtos)
    await salvar('produtos', value)
  },
}
