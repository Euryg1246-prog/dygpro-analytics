'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'
import { calcPullbackDepthBuckets, calcHourMapByDay, calcMonthlyByDay } from '@/lib/calc'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normDay(d: string) {
  const map: Record<string, string> = {
    'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié',
    'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb',
    'Domingo': 'Dom',
  }
  return map[d] ?? d
}

function currentHourLabel() {
  const h = new Date().getHours()
  return h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Semáforo ─────────────────────────────────────────────────────────────────
type Signal = 'GO' | 'CAUTION' | 'NO'
function getSignal(pullbackWin: number | null, hourScore: number, monthAvg: number | null): Signal {
  if (pullbackWin === null) return 'CAUTION'
  if (pullbackWin >= 80 && hourScore >= 10 && (monthAvg === null || monthAvg >= 0)) return 'GO'
  if (pullbackWin < 35) return 'NO'
  if (pullbackWin >= 60 && hourScore >= 5) return 'GO'
  return 'CAUTION'
}

const SIGNAL_STYLE: Record<Signal, { bg: string; border: string; text: string; label: string; sub: string }> = {
  GO:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400', label: '🟢 GO', sub: 'Setup activo — condiciones históricamente favorables' },
  CAUTION: { bg: 'bg-amber-500/10',   border: 'border-amber-500',   text: 'text-amber-400',   label: '🟡 ESPERA', sub: 'Condiciones mixtas — procede con tamaño reducido' },
  NO:      { bg: 'bg-red-500/10',     border: 'border-red-500',     text: 'text-red-400',     label: '🔴 NO ENTRES', sub: 'Probabilidad histórica en tu contra en estas condiciones' },
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DomingoPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [pullback, setPullback] = useState<string>('')
  const [now, setNow] = useState(new Date())

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])

  // Cargar sesiones
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

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando datos históricos...</div>

  const domSessions = sessions.filter(s => normDay(s.dia) === 'Dom')

  // ── Cálculos ──
  const buckets = calcPullbackDepthBuckets(sessions, 'Dom')
  const hourLow  = calcHourMapByDay(sessions, 'Dom', 'hora_baja')
  const hourHigh = calcHourMapByDay(sessions, 'Dom', 'hora_pico')
  const monthly  = calcMonthlyByDay(sessions, 'Dom')

  // Pullback actual → bucket correspondiente
  const pullbackPts = parseFloat(pullback)
  const matchedBucket = isNaN(pullbackPts) ? null : buckets.find(b =>
    pullbackPts >= b.minPts && (b.maxPts === null || pullbackPts < b.maxPts)
  ) ?? null

  // Hora actual → score (% frecuencia del low en esta hora)
  const hourLabel = currentHourLabel()
  const hourLowMatch = hourLow.find(h => h.hour === hourLabel)
  const hourHighMatch = hourHigh.find(h => h.hour === hourLabel)
  const hourScore = hourLowMatch?.pct ?? 0

  // Contexto del mes actual
  const thisMonth = currentMonthKey()
  const monthStat = monthly.find(m => m.month === thisMonth) ?? null
  // Promedio histórico de este mes en años anteriores
  const sameMonthNum = String(now.getMonth() + 1).padStart(2, '0')
  const historicSameMonth = monthly.filter(m => m.month.endsWith(`-${sameMonthNum}`) && m.month !== thisMonth)
  const historicAvg = historicSameMonth.length > 0
    ? Math.round(historicSameMonth.reduce((a, m) => a + m.avgPnl, 0) / historicSameMonth.length)
    : null

  // Señal global
  const signal = getSignal(matchedBucket?.winRate ?? null, hourScore, historicAvg)
  const ss = SIGNAL_STYLE[signal]

  // Stats generales domingo
  const domWins = domSessions.filter(s => (s.cierre ?? 0) >= 0).length
  const domWinRate = domSessions.length > 0 ? Math.round((domWins / domSessions.length) * 100) : 0
  const domAvg = domSessions.length > 0
    ? Math.round(domSessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / domSessions.length)
    : 0

  const dayName = now.toLocaleDateString('es', { weekday: 'long' })
  const timeStr = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚡ Domingo en Vivo</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Herramienta operacional — NQ Session Edge</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-mono font-bold text-zinc-200">{timeStr}</p>
          <p className="text-xs text-zinc-500 capitalize">{dayName} · {dateStr}</p>
        </div>
      </div>

      {/* Input de pullback */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto ha bajado el mercado desde el open?</p>
        <p className="text-xs text-zinc-500 mb-3">Escribe la profundidad actual del retroceso en puntos NQ</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            placeholder="ej: 45"
            value={pullback}
            onChange={e => setPullback(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-2xl font-mono font-bold text-zinc-100 w-40 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <span className="text-zinc-500 font-mono text-lg">pts</span>
          {pullback && (
            <button onClick={() => setPullback('')} className="text-xs text-zinc-500 hover:text-white ml-2">✕</button>
          )}
        </div>
      </div>

      {/* Semáforo principal */}
      <div className={`rounded-xl border-2 p-6 text-center ${ss.bg} ${ss.border}`}>
        <p className={`text-4xl font-black tracking-tight ${ss.text}`}>{ss.label}</p>
        <p className="text-sm text-zinc-400 mt-2">{ss.sub}</p>
      </div>

      {/* Tres factores */}
      <div className="grid grid-cols-3 gap-3">

        {/* Factor 1: Pullback */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📉 Profundidad</p>
          {matchedBucket ? (
            <>
              <p className={`text-3xl font-black ${matchedBucket.winRate >= 70 ? 'text-emerald-400' : matchedBucket.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {matchedBucket.winRate}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">win rate histórico</p>
              <p className="text-xs text-zinc-400 mt-2 font-mono">{matchedBucket.label}</p>
              <p className="text-xs text-zinc-500">{matchedBucket.trades} trades</p>
              <p className={`text-xs mt-1 font-semibold ${matchedBucket.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {matchedBucket.avgPnl >= 0 ? '+' : ''}{matchedBucket.avgPnl} avg
              </p>
            </>
          ) : (
            <p className="text-zinc-600 text-sm mt-2">Ingresa el pullback</p>
          )}
        </div>

        {/* Factor 2: Hora */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2">⏰ Hora actual</p>
          <p className="text-3xl font-black text-zinc-200">{hourLabel}</p>
          <p className="text-xs text-zinc-500 mt-1">hora del reloj</p>
          {hourLowMatch ? (
            <>
              <p className={`text-xs mt-2 font-semibold ${hourLowMatch.pct >= 10 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                Low en esta hora: {hourLowMatch.pct}%
              </p>
              <p className="text-xs text-zinc-500">de los domingos</p>
            </>
          ) : (
            <p className="text-xs text-zinc-600 mt-2">Sin datos para esta hora</p>
          )}
          {hourHighMatch && (
            <p className="text-xs text-zinc-500 mt-1">High: {hourHighMatch.pct}% de veces</p>
          )}
        </div>

        {/* Factor 3: Mes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📅 Mes histórico</p>
          {historicAvg !== null ? (
            <>
              <p className={`text-3xl font-black ${historicAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {historicAvg >= 0 ? '+' : ''}{historicAvg}
              </p>
              <p className="text-xs text-zinc-500 mt-1">avg pts este mes</p>
              <p className="text-xs text-zinc-500 mt-2">en {historicSameMonth.length} años anteriores</p>
              {monthStat && (
                <p className="text-xs text-zinc-400 mt-1">
                  Este año: {monthStat.winRate}% win · {monthStat.trades} trades
                </p>
              )}
            </>
          ) : (
            <p className="text-zinc-600 text-sm mt-2">Sin historial</p>
          )}
        </div>

      </div>

      {/* Tabla rápida de referencia */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">📊 Referencia rápida — Pullback vs Probabilidad</p>
        <div className="space-y-2">
          {buckets.map(b => {
            const active = matchedBucket?.label === b.label
            return (
              <div
                key={b.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                  active ? 'bg-zinc-700 ring-1 ring-emerald-500' : 'hover:bg-zinc-800/50'
                }`}
              >
                <span className="text-xs font-mono text-zinc-400 w-24">{b.label}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${b.winRate}%` }}
                  />
                </div>
                <span className={`text-sm font-bold w-12 text-right ${
                  b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 50 ? 'text-amber-400' : 'text-red-400'
                }`}>{b.winRate}%</span>
                <span className={`text-xs w-16 text-right font-mono ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.avgPnl >= 0 ? '+' : ''}{b.avgPnl}
                </span>
                <span className="text-xs text-zinc-600 w-16 text-right">{b.trades} trades</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">⚠️ Punto crítico: baja &gt;150 pts — probabilidad se invierte</p>
      </div>

      {/* Stats generales domingo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">🌟 Base histórica — Domingos ({domSessions.length} sesiones)</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold text-emerald-400">{domWinRate}%</p>
            <p className="text-xs text-zinc-500">Win Rate</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${domAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {domAvg >= 0 ? '+' : ''}{domAvg}
            </p>
            <p className="text-xs text-zinc-500">Avg pts</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-200">7</p>
            <p className="text-xs text-zinc-500">Años de datos</p>
          </div>
        </div>
      </div>

    </div>
  )
}
