'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function normDay(d: string) {
  const map: Record<string, string> = {
    'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié',
    'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb',
  }
  return map[d] ?? d
}

function getNYTime(now: Date) {
  const str = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
  const [, timePart] = str.split(', ')
  const parts = timePart.split(':').map(Number)
  const h = parts[0] === 24 ? 0 : parts[0]
  const m = parts[1]
  return { h, m, totalMin: h * 60 + m }
}

function toHourLabel(h: number) {
  return h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
}

// 8:00 AM – 8:00 PM NY (versión sin EMA, ventana óptima)
const SESSION_START = 8 * 60        // 480
const SESSION_END   = 20 * 60       // 1200

// ── Signal logic ─────────────────────────────────────────────────────────────

type BKSignal = 'GO' | 'GO_OOW' | 'CAUTION' | 'DANGER' | 'OUT'

function getSignal(inSession: boolean, inBestHour: boolean, maeUsd: number | null): BKSignal {
  if (!inSession) return 'OUT'
  if (maeUsd !== null && maeUsd >= 500) return 'DANGER'
  if (maeUsd !== null && maeUsd >= 250) return 'CAUTION'
  if (inBestHour) return 'GO'
  return 'GO_OOW'
}

const SIG: Record<BKSignal, { bg: string; border: string; text: string; label: string; sub: string }> = {
  GO:      { bg: 'bg-blue-500/10',    border: 'border-blue-500',   text: 'text-blue-400',
             label: '🔵  GO',
             sub: 'Ventana óptima de entrada activa — vigila los setups con breakout limpio' },
  GO_OOW:  { bg: 'bg-blue-500/10',   border: 'border-amber-400',  text: 'text-blue-400',
             label: '🔵  GO  ⚠️',
             sub: 'Sesión activa pero fuera de la mejor ventana — ok si el setup es claro, sin agregar' },
  CAUTION: { bg: 'bg-amber-500/10',  border: 'border-amber-500',  text: 'text-amber-400',
             label: '🟡  ATENCIÓN',
             sub: 'MAE entre $250–$500 USD — trade en zona de riesgo, evalúa salida parcial' },
  DANGER:  { bg: 'bg-red-500/10',    border: 'border-red-500',    text: 'text-red-400',
             label: '🔴  PELIGRO',
             sub: 'MAE ≥ $500 USD — zona de colapso histórico (3.2% win rate). Salida manual.' },
  OUT:     { bg: 'bg-zinc-900',      border: 'border-zinc-800',   text: 'text-zinc-600',
             label: '⚫  SESIÓN CERRADA',
             sub: 'Breakout v4 opera 8:00 AM – 8:00 PM NY' },
}

const DAYS_LIST = [
  { key: 'Lun', label: 'Lunes'     },
  { key: 'Mar', label: 'Martes'    },
  { key: 'Mié', label: 'Miércoles' },
  { key: 'Jue', label: 'Jueves'    },
  { key: 'Vie', label: 'Viernes'   },
]

interface SignalLog {
  id: string
  dia: string
  fecha: string
  hora: string
  pullback_pts: number
  signal: string
  en_ventana: boolean
  entro: boolean | null
  outcome_pts: number | null
  notas: string | null
  created_at: string
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BreakoutPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading]   = useState(true)
  const [activeDay, setActiveDay] = useState<string>(() => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const d = days[new Date().getDay()]
    return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].includes(d) ? d : 'Lun'
  })
  const [maeInput, setMaeInput]     = useState<string>('')
  const [now, setNow]               = useState(new Date())

  // Log state
  const [signalLogs, setSignalLogs]     = useState<SignalLog[]>([])
  const [logSaved, setLogSaved]         = useState(false)
  const [logOutcome, setLogOutcome]     = useState<string>('')
  const [savingLog, setSavingLog]       = useState(false)
  const [pendingLogId, setPendingLogId] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch('/api/sessions?strategy=breakout_v4')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha)))
        }
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetch('/api/signals')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSignalLogs(data) })
  }, [logSaved])

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-500 text-sm">Cargando...</p>
    </div>
  )

  // ── Tiempo NY ──
  const { h: nyH, m: nyM, totalMin: nyMin } = getNYTime(now)
  const inSession = nyMin >= SESSION_START && nyMin < SESSION_END

  // ── Pre-sesión: pantalla de countdown ──
  if (!inSession) {
    // Usar hora NY para detectar fin de semana correctamente
    const nyDowStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
    const isWeekend = nyDowStr === 'Sat' || nyDowStr === 'Sun'

    // Minutos hasta próximo open (Lun-Vie 9:30 AM NY)
    let minsLeft: number
    if (isWeekend) {
      const nyDow = nyDowStr === 'Sun' ? 0 : 6
      const daysUntilMon = nyDow === 0 ? 1 : 2
      minsLeft = daysUntilMon * 24 * 60 - nyMin + SESSION_START
    } else if (nyMin < SESSION_START) {
      minsLeft = SESSION_START - nyMin
    } else {
      // Después del close — próximo open es mañana
      // Pero si es Vie después del close → próximo es Lun
      const nyDowStr2 = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
      const extraDays = nyDowStr2 === 'Fri' ? 3 : 1
      minsLeft = extraDays * 24 * 60 - nyMin + SESSION_START
    }
    const dLeft = Math.floor(minsLeft / (60 * 24))
    const hLeft = Math.floor((minsLeft % (60 * 24)) / 60)
    const mLeft = minsLeft % 60

    return (
      <div className="max-w-lg mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center">
          <p className="text-6xl">⏳</p>
          <div>
            <p className="text-2xl font-black text-zinc-200">No hay sesión</p>
            <p className="text-zinc-500 mt-1">Breakout v4 · Lun–Vie 8:00 AM – 8:00 PM NY</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-10 py-6">
            <p className="text-5xl font-mono font-black text-blue-400">
              {dLeft > 0 ? `${dLeft}d ` : ''}{hLeft}h {String(mLeft).padStart(2, '0')}m
            </p>
            <p className="text-xs text-zinc-500 mt-2">para el próximo open</p>
          </div>
          <p className="text-xs text-zinc-600 max-w-xs">
            Regresa a las 8:00 AM NY. Hora dorada: 1PM NY (67% win rate histórico).
          </p>
        </div>
      </div>
    )
  }

  // ── Cálculos ─────────────────────────────────────────────────────────────

  const daySessions = sessions.filter(s => normDay(s.dia) === activeDay)

  // Horas de entrada por día (hora_baja = entry time en Breakout v4)
  const hourMap: Record<string, { t: number; w: number; total: number }> = {}
  for (const s of daySessions) {
    if (!s.hora_baja) continue
    const h = parseInt(s.hora_baja.split(':')[0])
    const lbl = toHourLabel(h)
    if (!hourMap[lbl]) hourMap[lbl] = { t: 0, w: 0, total: 0 }
    hourMap[lbl].t++
    hourMap[lbl].total += s.cierre ?? 0
    if ((s.cierre ?? 0) >= 0) hourMap[lbl].w++
  }

  const SESSION_HOURS = ['8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM']
  const hourStats = SESSION_HOURS
    .filter(h => hourMap[h] && hourMap[h].t >= 3)
    .map(h => ({
      hour: h,
      trades: hourMap[h].t,
      winRate: Math.round(hourMap[h].w / hourMap[h].t * 100),
      avgPnl:  Math.round(hourMap[h].total / hourMap[h].t),
    }))

  // Top 3 horas por win rate
  const topHours   = [...hourStats].sort((a, b) => b.winRate - a.winRate).slice(0, 3)
  const hotHourSet = new Set(topHours.map(h => h.hour))
  const currentHourLabel = toHourLabel(nyH)
  const inBestHour = hotHourSet.has(currentHourLabel)

  // MAE buckets (baja = "Desviación adversa USD" de TradingView)
  const maeBuckets = [
    { label: '< $100',    min: 0,   max: 100,  emoji: '🟢' },
    { label: '$100–$249', min: 100, max: 250,  emoji: '🟢' },
    { label: '$250–$499', min: 250, max: 500,  emoji: '🟡' },
    { label: '$500+',     min: 500, max: null, emoji: '🔴' },
  ].map(b => {
    const inB  = daySessions.filter(s => {
      const mae = Math.abs(s.baja ?? 0)
      return mae >= b.min && (b.max === null || mae < b.max)
    })
    const wins = inB.filter(s => (s.cierre ?? 0) >= 0)
    const tot  = inB.reduce((a, s) => a + (s.cierre ?? 0), 0)
    return {
      ...b,
      trades:  inB.length,
      winRate: inB.length > 0 ? Math.round(wins.length / inB.length * 100) : 0,
      avgPnl:  inB.length > 0 ? Math.round(tot / inB.length) : 0,
    }
  })

  // Signal
  const maeUsd  = parseFloat(maeInput)
  const maeVal  = isNaN(maeUsd) || maeUsd < 0 ? null : maeUsd
  const signal  = getSignal(inSession, inBestHour, maeVal)
  const ss      = SIG[signal]

  const matchedBucket = maeVal !== null
    ? maeBuckets.find(b => maeVal >= b.min && (b.max === null || maeVal < b.max)) ?? null
    : null

  // Stats del día
  const wins    = daySessions.filter(s => (s.cierre ?? 0) >= 0).length
  const winRate = daySessions.length > 0 ? Math.round(wins / daySessions.length * 100) : 0
  const avgPnl  = daySessions.length > 0
    ? Math.round(daySessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / daySessions.length)
    : 0

  const timeStr = `${String(nyH).padStart(2,'0')}:${String(nyM).padStart(2,'0')} NY`
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚡ Breakout v4 · En Vivo</h1>
          <p className="text-xs text-zinc-500 capitalize">{dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-black text-blue-400">{timeStr}</p>
          <p className="text-xs text-zinc-500">sesión activa</p>
        </div>
      </div>

      {/* Selector de día */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {DAYS_LIST.map(d => {
          const s  = sessions.filter(x => normDay(x.dia) === d.key)
          const w  = s.filter(x => (x.cierre ?? 0) >= 0).length
          const wr = s.length > 0 ? Math.round(w / s.length * 100) : 0
          const active = activeDay === d.key
          return (
            <button
              key={d.key}
              onClick={() => { setActiveDay(d.key); setMaeInput('') }}
              className={`flex-1 min-w-[64px] py-3 rounded-2xl font-bold text-sm transition-all border-2 shrink-0 ${
                active
                  ? 'bg-blue-500/15 border-blue-500 text-blue-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 active:bg-zinc-800'
              }`}
            >
              {d.label.slice(0, 3)}
              <span className={`block text-xs font-normal mt-0.5 ${active ? 'opacity-80' : 'opacity-50'}`}>
                {wr}% · {s.length}t
              </span>
            </button>
          )
        })}
      </div>

      {/* Ventana de hora */}
      <div className={`rounded-2xl border p-4 ${
        inBestHour ? 'bg-blue-500/8 border-blue-500/60' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-base font-bold leading-snug ${inBestHour ? 'text-blue-400' : 'text-zinc-300'}`}>
              {inBestHour
                ? '🎯 EN VENTANA ÓPTIMA'
                : `⏳ Fuera de ventana${topHours.length > 0 ? ` · mejor: ${topHours[0].hour}` : ''}`}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {inBestHour
                ? `${currentHourLabel} está entre las mejores horas de entrada para ${activeDay}`
                : `Mejores horas históricas: ${topHours.map(h => `${h.hour} (${h.winRate}%)`).join(', ')}`}
            </p>
          </div>
          <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded-lg text-zinc-400 shrink-0">
            {currentHourLabel}
          </span>
        </div>

        {/* Píldoras de hora */}
        {hourStats.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {hourStats.map(h => (
              <span
                key={h.hour}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                  h.hour === currentHourLabel
                    ? 'bg-blue-500 text-white'
                    : hotHourSet.has(h.hour)
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {h.hour} <span className="opacity-70">{h.winRate}%</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Input MAE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto va en tu contra el trade?</p>
        <p className="text-xs text-zinc-500 mb-4">
          USD adverso en el trade activo · $500+ es zona de colapso · $0 si no estás en trade
        </p>
        <div className="flex items-center gap-3">
          <span className="text-2xl text-zinc-500 font-mono shrink-0">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="0"
            value={maeInput}
            onChange={e => setMaeInput(e.target.value)}
            className={`bg-zinc-800 border-2 rounded-xl px-4 py-4 text-4xl font-mono font-black text-center text-zinc-100 w-full focus:outline-none transition-colors ${
              maeVal === null
                ? 'border-zinc-700 focus:border-zinc-500'
                : maeVal >= 500
                ? 'border-red-500'
                : maeVal >= 250
                ? 'border-amber-500'
                : 'border-blue-500'
            }`}
          />
        </div>
        {maeInput && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-zinc-500">
              {matchedBucket
                ? `${matchedBucket.emoji} ${matchedBucket.label} · ${matchedBucket.winRate}% win rate · ${matchedBucket.trades} trades`
                : '—'}
            </p>
            <button
              onClick={() => setMaeInput('')}
              className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              ✕ limpiar
            </button>
          </div>
        )}
      </div>

      {/* Semáforo */}
      <div className={`rounded-2xl border-2 p-7 text-center ${ss.bg} ${ss.border}`}>
        <p className={`text-5xl font-black tracking-tight ${ss.text}`}>{ss.label}</p>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{ss.sub}</p>
        <div className="flex justify-center gap-5 mt-5 text-xs text-zinc-500">
          <span className="flex flex-col items-center gap-1">
            <span className="text-base">{inBestHour ? '✓' : '✗'}</span>
            <span>ventana</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex flex-col items-center gap-1">
            <span className={`text-base font-bold ${
              maeVal === null ? '' : maeVal >= 500 ? 'text-red-400' : maeVal >= 250 ? 'text-amber-400' : 'text-blue-400'
            }`}>
              {maeVal !== null ? `$${maeVal}` : '—'}
            </span>
            <span>MAE USD</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex flex-col items-center gap-1">
            <span className="text-base">{winRate}%</span>
            <span>{activeDay} hist.</span>
          </span>
        </div>
      </div>

      {/* Tabla MAE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">
          Adversidad (MAE USD) → Probabilidad · {activeDay}
        </p>
        <div className="space-y-2.5">
          {maeBuckets.map(b => {
            const active = matchedBucket?.label === b.label
            return (
              <div
                key={b.label}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active ? 'bg-zinc-700 ring-2 ring-blue-500' : ''
                } ${b.label === '$500+' ? 'border border-red-500/20' : ''}`}
              >
                <span className="text-xs font-mono text-zinc-400 w-20 shrink-0">{b.label}</span>
                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${b.winRate}%` }}
                  />
                </div>
                <span className={`text-sm font-black w-10 text-right shrink-0 ${
                  b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 40 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {b.winRate}%
                </span>
                <span className={`text-xs w-16 text-right font-mono shrink-0 ${
                  b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {b.avgPnl >= 0 ? '+$' : '-$'}{Math.abs(b.avgPnl)}
                </span>
                <span className="text-xs text-zinc-600 w-10 text-right shrink-0">{b.trades}t</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">$500 USD ≈ 25 pts adversos con 10 MNQ · SL en 50 pts</p>
      </div>

      {/* Stats del día */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📊 {activeDay} total</p>
          <p className="text-3xl font-black text-blue-400">{winRate}%</p>
          <p className="text-xs text-zinc-500 mt-1">win rate · {daySessions.length} trades</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs text-zinc-500 mb-2">💰 P&L promedio</p>
          <p className={`text-3xl font-black ${avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgPnl >= 0 ? '+$' : '-$'}{Math.abs(avgPnl)}
          </p>
          <p className="text-xs text-zinc-500 mt-1">USD por trade</p>
        </div>
      </div>

      {/* Log de decisión */}
      {signal !== 'OUT' && signal !== 'DANGER' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-zinc-300">📝 Registrar esta señal</p>

          {!pendingLogId && !logSaved && (
            <>
              <p className="text-xs text-zinc-500">¿Entraste al breakout?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={async () => {
                    setSavingLog(true)
                    const fechaHoy = now.toISOString().slice(0, 10)
                    const res = await fetch('/api/signals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        dia: activeDay,
                        fecha: fechaHoy,
                        hora: currentHourLabel,
                        pullback_pts: maeVal ?? 0,
                        signal,
                        en_ventana: inBestHour,
                        entro: true,
                      }),
                    })
                    const d = await res.json()
                    setPendingLogId(d.id)
                    setSavingLog(false)
                  }}
                  disabled={savingLog}
                  className="py-3 rounded-xl bg-blue-500/15 border border-blue-500/50 text-blue-400 font-bold text-sm active:bg-blue-500/30"
                >
                  ✅ Sí, entré
                </button>
                <button
                  onClick={async () => {
                    setSavingLog(true)
                    const fechaHoy = now.toISOString().slice(0, 10)
                    await fetch('/api/signals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        dia: activeDay,
                        fecha: fechaHoy,
                        hora: currentHourLabel,
                        pullback_pts: maeVal ?? 0,
                        signal,
                        en_ventana: inBestHour,
                        entro: false,
                      }),
                    })
                    setLogSaved(true)
                    setSavingLog(false)
                  }}
                  disabled={savingLog}
                  className="py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold text-sm active:bg-zinc-700"
                >
                  ❌ No entré
                </button>
              </div>
            </>
          )}

          {pendingLogId && !logSaved && (
            <>
              <p className="text-xs text-zinc-500">¿Cuántos USD resultó? (completa después del trade)</p>
              <div className="flex gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="+500 o -100"
                  value={logOutcome}
                  onChange={e => setLogOutcome(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-mono font-bold text-zinc-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={async () => {
                    if (!logOutcome) return
                    setSavingLog(true)
                    await fetch('/api/signals', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: pendingLogId, outcome_pts: parseFloat(logOutcome) }),
                    })
                    setLogSaved(true)
                    setPendingLogId(null)
                    setSavingLog(false)
                  }}
                  disabled={savingLog || !logOutcome}
                  className="px-4 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
              <button onClick={() => setLogSaved(true)} className="text-xs text-zinc-600 hover:text-zinc-400">
                Llenar después →
              </button>
            </>
          )}

          {logSaved && (
            <div className="text-center py-2">
              <p className="text-blue-400 font-semibold">✓ Señal registrada</p>
              <button
                onClick={() => { setLogSaved(false); setPendingLogId(null); setLogOutcome('') }}
                className="text-xs text-zinc-600 hover:text-zinc-400 mt-1"
              >
                Registrar otra
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historial de señales */}
      {signalLogs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">🗂 Últimas señales registradas</p>
          <div className="space-y-2">
            {signalLogs.slice(0, 8).map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-500 font-mono w-20 shrink-0">{l.fecha}</span>
                <span className={`font-mono shrink-0 ${
                  l.signal === 'GO' ? 'text-blue-400'
                  : l.signal === 'GO_OOW' ? 'text-amber-400'
                  : l.signal === 'DANGER' ? 'text-red-400'
                  : 'text-zinc-500'
                }`}>
                  {l.signal === 'GO' ? '🔵' : l.signal === 'GO_OOW' ? '🔵⚠️' : l.signal === 'DANGER' ? '🔴' : '🟡'}
                </span>
                <span className="text-zinc-400 shrink-0">{l.dia}</span>
                <span className="text-zinc-600 shrink-0">{l.hora}</span>
                <span className="text-zinc-600 shrink-0">{l.entro ? 'Entró' : 'No entró'}</span>
                {l.outcome_pts !== null && (
                  <span className={`font-mono font-bold ml-auto shrink-0 ${l.outcome_pts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {l.outcome_pts >= 0 ? '+$' : '-$'}{Math.abs(l.outcome_pts)}
                  </span>
                )}
                {l.outcome_pts === null && l.entro && (
                  <span className="text-zinc-600 ml-auto text-xs">pendiente</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
