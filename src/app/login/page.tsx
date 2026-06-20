'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <Card className="bg-zinc-900 border-zinc-800 w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <p className="text-emerald-400 font-bold text-2xl">DYGPRO Analytics</p>
          <p className="text-zinc-500 text-sm mt-1">Inicia sesión para continuar</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Email</label>
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Contraseña</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
