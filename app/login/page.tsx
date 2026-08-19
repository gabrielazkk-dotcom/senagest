'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { Eye, EyeOff, Shield, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signIn, user, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard')
  }, [authLoading, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      toast.error('Email ou senha incorretos')
      setLoading(false)
    } else {
      router.replace('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-6 safe-top safe-bottom relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(225,29,72,0.22),transparent_65%)] pointer-events-none" />
      <div className="mb-10 flex flex-col items-center gap-4 animate-fade-in relative">
        <div className="w-16 h-16 bg-gradient-to-br from-brand-400 to-brand-700 shadow-brand rounded-2xl flex items-center justify-center rotate-3">
          <Zap className="w-8 h-8 text-white -rotate-3" />
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] font-semibold text-brand-400 mb-2">Operações em campo</p>
          <h1 className="text-3xl font-bold text-white tracking-tight">Sena<span className="text-brand-500">Gest</span></h1>
          <p className="text-surface-400 text-sm mt-1">Gestão Técnica Inteligente</p>
        </div>
      </div>

      <div className="w-full max-w-sm animate-slide-up">
        <div className="card space-y-4 p-6 border-white/10">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="input"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input pr-12"
                autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && handleSubmit(e as unknown as React.FormEvent)}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 p-1"
              >
                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Entrar
              </>
            )}
          </button>
        </div>

        <p className="text-center text-surface-500 text-xs mt-6">
          Acesso restrito a usuários cadastrados.
          <br />Entre em contato com o administrador.
        </p>
      </div>
    </div>
  )
}
