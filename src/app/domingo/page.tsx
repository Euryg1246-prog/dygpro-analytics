'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'
import { calcPullbackDepthBuckets, calcHourMapByDay, calcMonthlyByDay } from '@/lib/calc'

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

function currentHourLabel() {
  return toHourLabel(new Date().getHours())
}

// ─── Semáforo ─────────────────────────────────────────────────────────────────
type Signal = 'GO' | 'CAUTION' | 'NO'

function getSignal(winRate: number | null, inHourWindow: boolean, monthAvg: number | null): Signal {
  if (winRate === null) return 'CAUTION'
  if (winRate < 35) return 'NO'
  if (winRate >= 75 && inHourWindow && (monthAvg === null || monthAvg >= 0)) return 'GO'
  if (winRate >= 60 && inHourWindow) return 'GO'
  if (winRate >= 60) return 'CAUTION'
  return 'CAUTION'
}

const SIG: Record<Signal, { bg: string; border: string; text: string; label: string; sub: string }> = {
  GO:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400', label: '🟢  GO', sub: 'Setup activo — condiciones históricamente favorables' },
  CAUTION: { bg: 'bg-amber-500/10',   border: 'border-amber-500',   text: 'text-amber-400',   label: '🟡  ESPERA', sub: 'Condiciones mixtas — procede con tamaño reducido o espera' },
  NO:      { bg: 'bg-red-500/10',     border: 'border-red-500',     text: 'text-red-400',     label: '🔴  NO ENTRES', sub: 'Probabilidad histórica en tu contra — salta este trade' },
}

const DAYS = [
  { key: 'Dom', label: '🌟 Domingo', color: 'emerald' },
  { key: 'Mar', label: '📈 Martes',  color: 'blue'    },
]

// ─── Página ───────────────────────────────────────────────────────────────────
export default function OperacionalPage() {
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

  // Reset pullback al cambiar día
  const handleDayChange = (d: string) => { setActiveDay(d); setPullback('') }

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando datos históricos...</div>

  // ── Datos del día activo ──
  const daySessions = sessions.filter(s => normDay(s.dia) === activeDay)
  const buckets     = calcPullbackDepthBuckets(sessions, activeDay)
  const hourLow     = calcHourMapByDay(sessions, activeDay, 'hora_baja')
  const hourHigh    = calcHourMapByDay(sessions, activeDay, 'hora_pico')
  const monthly     = calcMonthlyByDay(sessions, activeDay)

  // Top 3 horas del LOW ordenadas por frecuencia
  const topLowHours = [...hourLow].sort((a, b) => b.count - a.count).slice(0, 3)
  const topHighHours = [...hourHigh].sort((a, b) => b.count - a.count).slice(0, 3)
  const hotLowHourSet = new Set(topLowHours.map(h => h.hour))

  // Hora actual
  const hourNow = currentHourLabel()
  const inLowWindow  = hotLowHourSet.has(hourNow)
  const hourLowNow   = hourLow.find(h => h.hour === hourNow)
  const hourHighNow  = hourHigh.find(h => h.hour === hourNow)

  // Próxima ventana si no estás en ella
  const allHoursOrdered = [
    '12AM','1AM','2AM','3AM','4AM','5AM','6AM','7AM','8AM','9AM','10AM','11AM',
    '12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM',
  ]
  const nowIdx = allHoursOrdered.indexOf(hourNow)
  const nextWindow = !inLowWindow
    ? topLowHours
        .map(h => ({ ...h, idx: allHoursOrdered.indexOf(h.hour) }))
        .filter(h => h.idx > nowIdx)
        .sort((a, b) => a.idx - b.idx)[0] ?? topLowHours[0]
    : null

  // Pullback → bucket
  const pts = parseFloat(pullback)
  const matched = isNaN(pts) ? null : buckets.find(b =>
    pts >= b.minPts && (b.maxPts === null || pts < b.maxPts)
  ) ?? null

  // Mes histórico
  const sameMonthNum  = String(now.getMonth() + 1).padStart(2, '0')
  const thisMonthKey  = `${now.getFullYear()}-${sameMonthNum}`
  const historicMonth = monthly.filter(m => m.month.endsWith(`-${sameMonthNum}`) && m.month !== thisMonthKey)
  const historicAvg   = historicMonth.length > 0
    ? Math.round(historicMonth.reduce((a, m) => a + m.avgPnl, 0) / historicMonth.length)
    : null
  const thisMonthStat = monthly.find(m => m.month === thisMonthKey) ?? null

  // Stats generales del día
  const wins    = daySessions.filter(s => (s.cierre ?? 0) >= 0).length
  const winRate = daySessions.length > 0 ? Math.round((wins / daySessions.length) * 100) : 0
  const avgPts  = daySessions.length > 0
    ? Math.round(daySessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / daySessions.length)
    : 0

  // Señal
  const signal = getSignal(matched?.winRate ?? null, inLowWindow, historicAvg)
  const ss = SIG[signal]

  const timeStr = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  const isBlue = activeDay === 'Mar'
  const accentGreen = 'text-emerald-400'
  const accentBlue  = 'text-blue-400'
  const accent = isBlue ? accentBlue : accentGreen

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚡ En Vivo</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Herramienta operacional — NQ Session Edge</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-bold text-zinc-200">{timeStr}</p>
          <p className="text-xs text-zinc-500 capitalize">{dateStr}</p>
        </div>
      </div>

      {/* Selector de día */}
      <div className="flex gap-3">
        {DAYS.map(d => (
          <button
            key={d.key}
            onClick={() => handleDayChange(d.key)}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
              activeDay === d.key
                ? d.key === 'Dom'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                  : 'bg-blue-500/15 border-blue-500 text-blue-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            {d.label}
            <span className="ml-2 text-xs font-normal opacity-60">{
              (() => {
                const s = sessions.filter(x => normDay(x.dia) === d.key)
                const w = s.filter(x => (x.cierre ?? 0) >= 0).length
                return s.length > 0 ? `${Math.round(w/s.length*100)}% win` : ''
              })()
            }</span>
          </button>
        ))}
      </div>

      {/* Ventana de tiempo — SECCIÓN NUEVA */}
      <div className={`rounded-xl border p-4 ${
        inLowWindow
          ? 'bg-emerald-500/5 border-emerald-500/50'
          : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-zinc-400">⏰ Ventana de tiempo — Low histórico</p>
          <span className="text-xs font-mono text-zinc-500">{hourNow}</span>
        </div>

        {inLowWindow ? (
          <p className={`text-base font-bold ${accent} mb-1`}>
            🎯 ESTÁS EN VENTANA — el low suele ocurrir ahora
          </p>
        ) : (
          <p className="text-base font-bold text-zinc-400 mb-1">
            ⏳ Fuera de ventana principal
            {nextWindow ? ` — próxima: ${nextWindow.hour}` : ''}
          </p>
        )}

        {hourLowNow && (
          <p className="text-xs text-zinc-500">
            Esta hora ocurre el low en el <span className={`font-semibold ${accent}`}>{hourLowNow.pct}%</span> de los {activeDay === 'Dom' ? 'domingos' : 'martes'}
            {hourHighNow ? ` · high en el ${hourHighNow.pct}%` : ''}
          </p>
        )}

        {/* Top horas del low */}
        <div className="mt-3 flex gap-2 flex-wrap">
          <p className="text-xs text-zinc-600 w-full">Top horas del LOW:</p>
          {topLowHours.map((h, i) => (
            <div
              key={h.hour}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
                h.hour === hourNow
                  ? isBlue ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'
                  : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {i + 1}. {h.hour} <span className="opacity-70">({h.pct}%)</span>
            </div>
          ))}
          <p className="text-xs text-zinc-600 w-full mt-1">Top horas del HIGH:</p>
          {topHighHours.map((h, i) => (
            <div
              key={h.hour}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
                h.hour === hourNow ? 'bg-zinc-600 text-white' : 'bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {i + 1}. {h.hour} <span className="opacity-70">({h.pct}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Input de pullback */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto ha bajado desde el open?</p>
        <p className="text-xs text-zinc-500 mb-3">Profundidad actual del retroceso en puntos NQ</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            placeholder="ej: 45"
            value={pullback}
            onChange={e => setPullback(e.target.value)}
            className={`bg-zinc-800 border rounded-lg px-4 py-3 text-2xl font-mono font-bold text-zinc-100 w-40 focus:outline-none transition-colors ${
              pullback ? (isBlue ? 'border-blue-500' : 'border-emerald-500') : 'border-zinc-700'
            }`}
          />
          <span className="text-zinc-500 font-mono text-lg">pts</span>
          {pullback && <button onClick={() => setPullback('')} className="text-xs text-zinc-500 hover:text-white ml-2">✕</button>}
        </div>
        {matched && (
          <p className="text-xs text-zinc-500 mt-2">
            Bucket: <span className="font-mono text-zinc-300">{matched.label}</span> · {matched.trades} trades en historial
          </p>
        )}
      </div>

      {/* Semáforo */}
      <div className={`rounded-xl border-2 p-6 text-center ${ss.bg} ${ss.border}`}>
        <p className={`text-4xl font-black tracking-tight ${ss.text}`}>{ss.label}</p>
        <p className="text-sm text-zinc-400 mt-2">{ss.sub}</p>
        {/* Resumen de factores */}
        <div className="flex justify-center gap-6 mt-4 text-xs text-zinc-500">
          <span>📉 {matched ? `${matched.winRate}% win` : '—'}</span>
          <span>⏰ {inLowWindow ? 'En ventana' : 'Fuera de ventana'}</span>
          <span>📅 {historicAvg !== null ? `Mes: ${historicAvg >= 0 ? '+' : ''}${historicAvg}` : 'Sin historial'}</span>
        </div>
      </div>

      {/* Tabla de referencia */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">📊 Pullback vs Probabilidad — {activeDay === 'Dom' ? 'Domingos' : 'Martes'}</p>
        <div className="space-y-2">
          {buckets.map(b => {
            const active = matched?.label === b.label
            return (
              <div
                key={b.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                  active
                    ? isBlue ? 'bg-zinc-700 ring-1 ring-blue-500' : 'bg-zinc-700 ring-1 ring-emerald-500'
                    : 'hover:bg-zinc-800/50'
                }`}
              >
                <span className="text-xs font-mono text-zinc-400 w-24">{b.label}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${b.winRate}%` }}
                  />
                </div>
                <span className={`text-sm font-bold w-12 text-right ${b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {b.winRate}%
                </span>
                <span className={`text-xs w-16 text-right font-mono ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.avgPnl >= 0 ? '+' : ''}{b.avgPnl}
                </span>
                <span className="text-xs text-zinc-600 w-14 text-right">{b.trades} trades</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">⚠️ Punto crítico: &gt;150 pts — probabilidad se invierte</p>
      </div>

      {/* Contexto mes + base histórica */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📅 Este mes históricamente</p>
          {historicAvg !== null ? (
            <>
              <p className={`text-3xl font-black ${historicAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {historicAvg >= 0 ? '+' : ''}{historicAvg}
              </p>
              <p className="text-xs text-zinc-500 mt-1">avg pts · {historicMonth.length} años</p>
              {thisMonthStat && (
                <p className="text-xs text-zinc-400 mt-2">
                  2026: {thisMonthStat.winRate}% win · {thisMonthStat.trades} trades
                </p>
              )}
            </>
          ) : (
            <p className="text-zinc-600 text-sm mt-2">Sin historial</p>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2">🌟 Base histórica total</p>
          <p className={`text-3xl font-black ${accent}`}>{winRate}%</p>
          <p className="text-xs text-zinc-500 mt-1">win rate</p>
          <p className={`text-sm font-semibold mt-2 ${avgPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgPts >= 0 ? '+' : ''}{avgPts} avg pts
          </p>
          <p className="text-xs text-zinc-500">{daySessions.length} sesiones</p>
        </div>
      </div>

    </div>
  )
}
