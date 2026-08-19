'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Profile } from '../types'
import { offlineData } from '../lib/offlineData'
import { estoqueSvc } from '../estoque'
import { clienteSvc } from '../services/cliente'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  offlineAccess: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function prepararDadosOffline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  await Promise.allSettled([estoqueSvc.getProdutos(), clienteSvc.getClientes()])
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [offlineAccess, setOfflineAccess] = useState(false)

  const abrirAcessoLocal = async () => {
    const [cachedUser, cachedProfile] = await Promise.all([
      offlineData.getUser(),
      offlineData.getProfile(),
    ])
    if (!cachedUser || !cachedProfile) return false
    setUser(cachedUser)
    setProfile(cachedProfile)
    setOfflineAccess(true)
    return true
  }

  const createProfile = async (user: User) => {
    const email = user.email ?? ''
    const nome = user.email ? user.email.split('@')[0] : 'Técnico'

    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: user.id, nome, email })
      .select('*')
      .single()

    if (error) {
      console.error('Erro criando perfil:', error)
      return null
    }

    return data
  }

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Erro ao buscar perfil:', error)
      setProfile(await offlineData.getProfile())
      return
    }

    if (data) {
      setProfile(data)
      await offlineData.setProfile(data)
      return
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setProfile(null)
      return
    }

    const createdProfile = await createProfile(user)
    setProfile(createdProfile ?? null)
    if (createdProfile) await offlineData.setProfile(createdProfile)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        setUser(session.user)
        setOfflineAccess(false)
        await offlineData.setUser(session.user)
        const cachedProfile = await offlineData.getProfile()
        if (cachedProfile) setProfile(cachedProfile)
        prepararDadosOffline()
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await abrirAcessoLocal()
        } else {
          setUser(null)
        }
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          setUser(session.user)
          setOfflineAccess(false)
          await offlineData.setUser(session.user)
          prepararDadosOffline()
          await fetchProfile(session.user.id)
        } else {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            await abrirAcessoLocal()
          } else {
            setUser(null)
            setProfile(null)
            setOfflineAccess(false)
          }
        }
        setLoading(false)
      }
    )

    // No celular, quando o app fica em segundo plano (tela apaga, troca de app),
    // o navegador pausa o timer de renovação automática do token do Supabase.
    // Quando o usuário volta, forçamos uma renovação da sessão aqui, antes que
    // ele tente salvar algo com um token já expirado (o que causava o "trava e
    // não salva" até recarregar a página).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession()
      }
    }

    const handleOnline = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) {
        setUser(null)
        setSession(null)
        setProfile(null)
        setOfflineAccess(false)
        return
      }
      setUser(data.user)
      setOfflineAccess(false)
      await offlineData.setUser(data.user)
      await fetchProfile(data.user.id)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      setUser(null)
      setProfile(null)
      setOfflineAccess(false)
      await Promise.all([offlineData.clearUser(), offlineData.clearProfile()])
    }
  }

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading, offlineAccess,
      isAdmin: profile?.role === 'admin',
      signIn, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
