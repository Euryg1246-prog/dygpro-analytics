'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'
import { calcPullbackDepthBuckets, calcHourMapByDay, calcMonthlyByDay } from '@/lib/calc'

function normDay(d: string) {
  const map: Record<string, string> = {
    'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié',
    'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb',
    'Domingo': 'Dom', 'Martes': 'Mar',
  }
  return map[d] ?? d
}

function toHourLabel(h: number) {
  return h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
}

const HOUR_ORDER = [
  '12AM','1AM','2AM','3AM','4AM','5AM','6AM','7AM','8AM','9AM','10AM','11AM',
  '12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM',
]

type Signal = 'GO' | 'GO_OOW' | 'CAUTION' | 'NO'

function getSignal(winRate: number | null, inWindow: boolean, monthAvg: number | null): Signal {
  if (winRate === null) return 'CAUTION'
  if (winRate < 35) return 'NO'
  // Pullback fuerte → GO siempre (la probabilidad sola justifica entrar)
  if (winRate >= 80) return (monthAvg === null || monthAvg >= 0) ? 'GO' : 'GO_OOW'
  // Pullback bueno + en ventana → GO limpio
  if (winRate >= 60 && inWindow) return 'GO'
  // Pullback bueno pero fuera de ventana → GO con advertencia de hora
  if (winRate >= 60) return 'GO_OOW'
  return 'CAUTION'
}

const SIG: Record<Signal, { bg: string; border: string; text: string; label: string; sub: string }> = {
  GO:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500',      text: 'text-emerald-400', label: '🟢  GO',               sub: 'Pullback favorable + en ventana de hora — entra' },
  GO_OOW:  { bg: 'bg-emerald-500/10', border: 'border-amber-400',        text: 'text-emerald-400', label: '🟢  GO  ⚠️',           sub: 'Pullback favorable pero fuera de ventana de hora — tamaño normal, sin agregar' },
  CAUTION: { bg: 'bg-amber-500/10',   border: 'border-amber-500',        text: 'text-amber-400',   label: '🟡  ESPERA',           sub: 'Condiciones mixtas — espera mejor setup o reduce tamaño' },
  NO:      { bg: 'bg-red-500/10',     border: 'border-red-500',          text: 'text-red-400',     label: '🔴  NO ENTRES',        sub: 'Probabilidad histórica en tu contra — salta este trade' },
}

const DAYS = [
  { key: 'Dom', label: '🌟 Domingo' },
  { key: 'Mar', label: '📈 Martes'  },
]

export default function EnVivoPage() {
  const [sessions, setSessions]   = useState<Session[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeDay, setActiveDay] = useState<string>('Dom')
  const [pullback, setPullback]   = useState<string>('')
  const [now, setNow]             = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch('/api/sessions?strategy=session_edge')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha)))
        }
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-500 text-sm">Cargando...</p>
    </div>
  )

  // ── Pantalla pre-mercado: domingo antes de las 6PM ──
  const isSunday  = now.getDay() === 0
  const isTuesday = now.getDay() === 2
  const hour      = now.getHours()
  const minutes   = now.getMinutes()

  if (activeDay === 'Dom' && isSunday && hour < 18) {
    const minsLeft = (18 - hour - 1) * 60 + (60 - minutes)
    const hLeft    = Math.floor(minsLeft / 60)
    const mLeft    = minsLeft % 60
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center">
        <p className="text-6xl">⏳</p>
        <div>
          <p className="text-2xl font-black text-zinc-200">Aún no es hora</p>
          <p className="text-zinc-500 mt-1">Mercado abre a las 6:00 PM</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-10 py-6">
          <p className="text-5xl font-mono font-black text-emerald-400">
            {hLeft}h {String(mLeft).padStart(2, '0')}m
          </p>
          <p className="text-xs text-zinc-500 mt-2">para el open</p>
        </div>
        <p className="text-xs text-zinc-600 max-w-xs">
          Vuelve aquí cuando abra. Ten listo el nivel del open de NQ.
        </p>
      </div>
    )
  }

  // ── Cálculos ──
  const daySessions = sessions.filter(s => normDay(s.dia) === activeDay)
  const buckets     = calcPullbackDepthBuckets(sessions, activeDay)
  const hourLow     = calcHourMapByDay(sessions, activeDay, 'hora_baja')
  const hourHigh    = calcHourMapByDay(sessions, activeDay, 'hora_pico')
  const monthly     = calcMonthlyByDay(sessions, activeDay)

  const topLowHours  = [...hourLow].sort((a, b) => b.count - a.count).slice(0, 3)
  const topHighHours = [...hourHigh].sort((a, b) => b.count - a.count).slice(0, 3)
  const hotLowSet    = new Set(topLowHours.map(h => h.hour))

  const hourNow     = toHourLabel(now.getHours())
  const inWindow    = hotLowSet.has(hourNow)
  const hourLowNow  = hourLow.find(h => h.hour === hourNow)
  const hourHighNow = hourHigh.find(h => h.hour === hourNow)

  // Próxima ventana
  const nowIdx = HOUR_ORDER.indexOf(hourNow)
  const nextWindow = !inWindow
    ? topLowHours
        .map(h => ({ ...h, idx: HOUR_ORDER.indexOf(h.hour) }))
        .filter(h => h.idx > nowIdx)
        .sort((a, b) => a.idx - b.idx)[0] ?? topLowHours[0]
    : null

  // Pullback → bucket
  const pts     = parseFloat(pullback)
  const matched = isNaN(pts) ? null : buckets.find(b =>
    pts >= b.minPts && (b.maxPts === null || pts < b.maxPts)
  ) ?? null

  // Mes
  const sameMonthNum  = String(now.getMonth() + 1).padStart(2, '0')
  const thisMonthKey  = `${now.getFullYear()}-${sameMonthNum}`
  const historicMonth = monthly.filter(m => m.month.endsWith(`-${sameMonthNum}`) && m.month !== thisMonthKey)
  const historicAvg   = historicMonth.length > 0
    ? Math.round(historicMonth.reduce((a, m) => a + m.avgPnl, 0) / historicMonth.length)
    : null
  const thisMonthStat = monthly.find(m => m.month === thisMonthKey) ?? null

  // Stats generales
  const wins    = daySessions.filter(s => (s.cierre ?? 0) >= 0).length
  const winRate = daySessions.length > 0 ? Math.round((wins / daySessions.length) * 100) : 0
  const avgPts  = daySessions.length > 0
    ? Math.round(daySessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / daySessions.length)
    : 0

  // Señal
  const signal = getSignal(matched?.winRate ?? null, inWindow, historicAvg)
  const ss = SIG[signal]

  const timeStr = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  const isDom   = activeDay === 'Dom'

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header compacto */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚡ En Vivo</h1>
          <p className="text-xs text-zinc-500 capitalize">{dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-mono font-black text-zinc-100">{timeStr}</p>
        </div>
      </div>

      {/* Selector de día — botones grandes táctiles */}
      <div className="grid grid-cols-2 gap-3">
        {DAYS.map(d => {
          const s = sessions.filter(x => normDay(x.dia) === d.key)
          const w = s.filter(x => (x.cierre ?? 0) >= 0).length
          const wr = s.length > 0 ? Math.round(w / s.length * 100) : 0
          const active = activeDay === d.key
          return (
            <button
              key={d.key}
              onClick={() => { setActiveDay(d.key); setPullback('') }}
              className={`py-4 rounded-2xl font-bold text-base transition-all border-2 ${
                active
                  ? d.key === 'Dom'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                    : 'bg-blue-500/15 border-blue-500 text-blue-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 active:bg-zinc-800'
              }`}
            >
              {d.label}
              <span className={`block text-xs font-normal mt-0.5 ${active ? 'opacity-80' : 'opacity-50'}`}>
                {wr}% win · {s.length} sesiones
              </span>
            </button>
          )
        })}
      </div>

      {/* Ventana de tiempo */}
      <div className={`rounded-2xl border p-4 ${
        inWindow ? 'bg-emerald-500/8 border-emerald-500/60' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-base font-bold leading-snug ${inWindow ? 'text-emerald-400' : 'text-zinc-300'}`}>
              {inWindow
                ? '🎯 ESTÁS EN VENTANA'
                : `⏳ Fuera de ventana${nextWindow ? ` · próxima: ${nextWindow.hour}` : ''}`
              }
            </p>
            {hourLowNow
              ? <p className="text-xs text-zinc-500 mt-1">
                  Low ocurre a esta hora en el <span className="font-semibold text-zinc-300">{hourLowNow.pct}%</span> de los {isDom ? 'domingos' : 'martes'}
                  {hourHighNow ? ` · high: ${hourHighNow.pct}%` : ''}
                </p>
              : <p className="text-xs text-zinc-600 mt-1">Sin datos para esta hora</p>
            }
          </div>
          <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded-lg text-zinc-400 shrink-0">{hourNow}</span>
        </div>

        {/* Top horas en píldoras */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-600 w-16 shrink-0">📉 Low:</span>
            {topLowHours.map(h => (
              <span key={h.hour} className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                h.hour === hourNow
                  ? isDom ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'
                  : 'bg-zinc-800 text-zinc-300'
              }`}>
                {h.hour} <span className="opacity-60">({h.pct}%)</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-600 w-16 shrink-0">📈 High:</span>
            {topHighHours.map(h => (
              <span key={h.hour} className={`px-2.5 py-1 rounded-lg text-xs font-mono ${
                h.hour === hourNow ? 'bg-zinc-600 text-white' : 'bg-zinc-800/60 text-zinc-400'
              }`}>
                {h.hour} <span className="opacity-60">({h.pct}%)</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Input pullback — grande y táctil */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto ha bajado desde el open?</p>
        <p className="text-xs text-zinc-500 mb-4">Puntos NQ de retroceso desde apertura</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="0"
            value={pullback}
            onChange={e => setPullback(e.target.value)}
            className={`bg-zinc-800 border-2 rounded-xl px-4 py-4 text-4xl font-mono font-black text-center text-zinc-100 w-full focus:outline-none transition-colors ${
              pullback
                ? isDom ? 'border-emerald-500' : 'border-blue-500'
                : 'border-zinc-700 focus:border-zinc-500'
            }`}
          />
        </div>
        {pullback && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-zinc-500">
              Bucket: <span className="font-mono text-zinc-300">{matched?.label ?? '—'}</span>
              {matched ? ` · ${matched.trades} trades históricos` : ''}
            </p>
            <button onClick={() => setPullback('')} className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors">
              ✕ limpiar
            </button>
          </div>
        )}
      </div>

      {/* Semáforo — el más grande y prominente */}
      <div className={`rounded-2xl border-2 p-7 text-center ${ss.bg} ${ss.border}`}>
        <p className={`text-5xl font-black tracking-tight ${ss.text}`}>{ss.label}</p>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{ss.sub}</p>
        <div className="flex justify-center gap-5 mt-5 text-xs text-zinc-500">
          <span className="flex flex-col items-center gap-1">
            <span className="text-base">{matched ? `${matched.winRate}%` : '—'}</span>
            <span>pullback</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex flex-col items-center gap-1">
            <span className="text-base">{inWindow ? '✓' : '✗'}</span>
            <span>ventana</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex flex-col items-center gap-1">
            <span className="text-base">{historicAvg !== null ? `${historicAvg >= 0 ? '+' : ''}${historicAvg}` : '—'}</span>
            <span>mes histórico</span>
          </span>
        </div>
      </div>

      {/* Tabla de referencia rápida */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">
          Pullback → Probabilidad · {isDom ? 'Domingos' : 'Martes'}
        </p>
        <div className="space-y-2.5">
          {buckets.map(b => {
            const active = matched?.label === b.label
            return (
              <div
                key={b.label}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active
                    ? isDom ? 'bg-zinc-700 ring-2 ring-emerald-500' : 'bg-zinc-700 ring-2 ring-blue-500'
                    : ''
                }`}
              >
                <span className="text-xs font-mono text-zinc-400 w-20 shrink-0">{b.label}</span>
                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${b.winRate}%` }}
                  />
                </div>
                <span className={`text-sm font-black w-10 text-right shrink-0 ${b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {b.winRate}%
                </span>
                <span className={`text-xs w-14 text-right font-mono shrink-0 ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.avgPnl >= 0 ? '+' : ''}{b.avgPnl}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">⚠️ &gt;150 pts — probabilidad se invierte</p>
      </div>

      {/* Contexto mes + base */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📅 Este mes hist.</p>
          {historicAvg !== null ? (
            <>
              <p className={`text-3xl font-black ${historicAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {historicAvg >= 0 ? '+' : ''}{historicAvg}
              </p>
              <p className="text-xs text-zinc-500 mt-1">avg pts · {historicMonth.length} años</p>
              {thisMonthStat && (
                <p className="text-xs text-zinc-400 mt-2">
                  2026: {thisMonthStat.winRate}% · {thisMonthStat.trades} trades
                </p>
              )}
            </>
          ) : (
            <p className="text-zinc-600 text-sm mt-2">Sin historial</p>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📊 Base total</p>
          <p className={`text-3xl font-black ${isDom ? 'text-emerald-400' : 'text-blue-400'}`}>{winRate}%</p>
          <p className="text-xs text-zinc-500 mt-1">win rate</p>
          <p className={`text-sm font-bold mt-2 ${avgPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgPts >= 0 ? '+' : ''}{avgPts} avg
          </p>
          <p className="text-xs text-zinc-500">{daySessions.length} sesiones</p>
        </div>
      </div>

    </div>
  )
}
