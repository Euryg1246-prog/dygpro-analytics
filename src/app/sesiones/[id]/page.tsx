'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Session } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function fmt(v: number | null | undefined, prefix = ''): string {
  if (v === null || v === undefined) return '—'
  return prefix + v.toString()
}

function fmtSign(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v >= 0 ? '+' + v : v.toString()
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(data => {
        setSession(data)
        setNotas(data.notas ?? '')
        setLoading(false)
      })
  }, [id])

  const handleSave = async () => {
    if (!session?.id) return
    setSaving(true)
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando...</div>
  if (!session) return <div className="text-red-400 text-center py-20">Sesión no encontrada</div>

  const strategyLabel = session.strategy === 'breakout_v4'
    ? 'Breakout v4'
    : session.strategy === 'session_edge'
    ? 'Session Edge'
    : session.strategy

  const cierreColor = (session.cierre ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'

  const stats: { label: string; value: string; color?: string }[] = [
    { label: 'Fecha', value: session.fecha },
    { label: 'Día', value: session.dia },
    { label: 'Estrategia', value: strategyLabel },
    { label: 'Open Price', value: session.open_price?.toFixed(2) ?? '—' },
    { label: 'Baja (MAE)', value: fmt(session.baja), color: 'text-red-400' },
    { label: 'Cierre (P&L)', value: fmtSign(session.cierre), color: cierreColor },
    { label: 'Max Alta (MFE)', value: fmtSign(session.max_alta), color: 'text-emerald-400' },
    { label: 'Hora Pico', value: session.hora_pico ?? '—' },
    { label: 'Hora Baja', value: session.hora_baja ?? '—', color: 'text-yellow-400' },
    { label: 'Min Pico', value: fmt(session.min_pico) },
    { label: 'Recuperación', value: fmtSign(session.recuperacion), color: 'text-emerald-400' },
    { label: 'Rec%', value: session.rec_pct !== null && session.rec_pct !== undefined ? session.rec_pct + '%' : '—' },
    { label: 'Dev Max', value: fmt(session.dev_max) },
    { label: 'MFE/MAE', value: session.mfe_mae !== null && session.mfe_mae !== undefined ? session.mfe_mae.toFixed(1) : '—' },
    { label: 'Acumulado', value: session.acumulado !== null && session.acumulado !== undefined ? fmtSign(Math.round(session.acumulado)) : '—', color: (session.acumulado ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Source', value: session.source },
  ]

  // Pullback insight
  const hasPullback = session.baja !== null && (session.baja ?? 0) < 0 && session.cierre !== null
  const simPnl = hasPullback ? Math.round(session.cierre! - session.baja!) : null
  const improvement = hasPullback ? Math.round(Math.abs(session.baja!)) : null

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-zinc-400 hover:text-white text-sm flex items-center gap-1"
        >
          ← Volver
        </button>
        <h1 className="text-xl font-bold">
          Sesión — <span className="text-zinc-400">{session.fecha}</span>
          <span className="ml-3 text-sm font-normal text-zinc-500">{strategyLabel}</span>
        </h1>
      </div>

      {/* P&L destacado */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">P&L Real</p>
            <p className={`text-3xl font-bold ${cierreColor}`}>{fmtSign(session.cierre)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">MAE (Baja)</p>
            <p className="text-3xl font-bold text-red-400">{fmt(session.baja)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">MFE (Max Alta)</p>
            <p className="text-3xl font-bold text-emerald-400">{fmtSign(session.max_alta)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Simulación pullback si aplica */}
      {hasPullback && (
        <Card className="bg-zinc-900 border-amber-700/40">
          <CardContent className="p-4">
            <p className="text-xs text-amber-400 font-semibold mb-2">📊 Simulación — Entrada en retroceso</p>
            <div className="flex gap-8 text-sm">
              <div>
                <p className="text-zinc-500 text-xs">Entrada real</p>
                <p className={`font-bold ${cierreColor}`}>{fmtSign(session.cierre)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Entrada en MAE</p>
                <p className={`font-bold ${(simPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtSign(simPnl)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Mejora</p>
                <p className="font-bold text-amber-400">+{improvement}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Todos los datos */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">Datos completos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {stats.map(stat => (
              <div key={stat.label}>
                <p className="text-xs text-zinc-500">{stat.label}</p>
                <p className={`text-sm font-medium ${stat.color ?? 'text-zinc-200'}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notas */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">Notas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Agrega observaciones sobre esta sesión..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500 min-h-[120px]"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-sm rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar notas'}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
