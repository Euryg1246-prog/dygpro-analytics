'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'

// MAE × Día × Hora → valor esperado USD (cuando MAE ≤ $1,000 / 50pts)
// Fuente: backtest BK v4 sin EMA, 1,793 trades, ventana 8AM-8PM NY
const EV_MATRIX: Record<string, Record<number, { n: number; avg: number }>> = {
  Lun: { 8:{n:0,avg:0}, 9:{n:46,avg:1516}, 10:{n:17,avg:1362}, 11:{n:19,avg:1320}, 12:{n:20,avg:1135}, 13:{n:23,avg:1157}, 14:{n:14,avg:1002}, 15:{n:20,avg:1702}, 16:{n:9,avg:980}, 17:{n:0,avg:0}, 18:{n:7,avg:1407}, 19:{n:6,avg:767} },
  Mar: { 8:{n:0,avg:0}, 9:{n:37,avg:1569}, 10:{n:31,avg:1431}, 11:{n:16,avg:1614}, 12:{n:17,avg:1473}, 13:{n:15,avg:1212}, 14:{n:19,avg:970}, 15:{n:27,avg:1144}, 16:{n:13,avg:1176}, 17:{n:0,avg:0}, 18:{n:7,avg:1507}, 19:{n:11,avg:1187} },
  Mié: { 8:{n:0,avg:0}, 9:{n:36,avg:1560}, 10:{n:23,avg:1449}, 11:{n:16,avg:993}, 12:{n:11,avg:1277}, 13:{n:16,avg:3213}, 14:{n:29,avg:1997}, 15:{n:20,avg:1173}, 16:{n:12,avg:1111}, 17:{n:0,avg:0}, 18:{n:10,avg:1381}, 19:{n:6,avg:996} },
  Jue: { 8:{n:0,avg:0}, 9:{n:33,avg:1511}, 10:{n:20,avg:1295}, 11:{n:20,avg:1149}, 12:{n:6,avg:1313}, 13:{n:27,avg:1573}, 14:{n:16,avg:1270}, 15:{n:21,avg:1012}, 16:{n:7,avg:1740}, 17:{n:0,avg:0}, 18:{n:12,avg:1157}, 19:{n:6,avg:857} },
  Vie: { 8:{n:0,avg:0}, 9:{n:33,avg:1761}, 10:{n:26,avg:1284}, 11:{n:11,avg:1676}, 12:{n:15,avg:1159}, 13:{n:16,avg:938}, 14:{n:12,avg:1128}, 15:{n:20,avg:1715}, 16:{n:2,avg:4103}, 17:{n:0,avg:0}, 18:{n:0,avg:0}, 19:{n:0,avg:0} },
}

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

const SESSION_START = 8 * 60
const SESSION_END   = 20 * 60
const SL_USD = 1000  // 50 pts × $20/pt (10 MNQ)

type Decision = 'DEJAR' | 'CERRAR' | 'IDLE' | 'OUT'

function getDecision(inSession: boolean, maeUsd: number | null): Decision {
  if (!inSession) return 'OUT'
  if (maeUsd === null) return 'IDLE'
  if (maeUsd >= SL_USD) return 'CERRAR'
  return 'DEJAR'
}

const DEC: Record<Decision, { bg: string; border: string; text: string; label: string; sub: string }> = {
  DEJAR:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400',
            label: '✅  DEJAR CORRER',
            sub: 'MAE < 50pts — 100% win histórico (1,005 trades). La automatización sigue su curso.' },
  CERRAR: { bg: 'bg-red-500/10',     border: 'border-red-500',     text: 'text-red-400',
            label: '🔴  CERRAR MANUAL',
            sub: 'MAE ≥ 50pts (zona SL) — 4.4% win histórico. Override ahora. Pérdida esperada: -$1,134.' },
  IDLE:   { bg: 'bg-zinc-900',       border: 'border-zinc-700',    text: 'text-zinc-400',
            label: '⚡  SESIÓN ACTIVA',
            sub: 'Ingresa el MAE del trade activo para ver la decisión. Sin trade activo: espera el setup.' },
  OUT:    { bg: 'bg-zinc-900',       border: 'border-zinc-800',    text: 'text-zinc-600',
            label: '⚫  SESIÓN CERRADA',
            sub: 'Breakout v4 opera 8:00 AM – 8:00 PM NY · Automatizado vía TradersPost' },
}

const DAYS_LIST = [
  { key: 'Lun', label: 'Lunes'     },
  { key: 'Mar', label: 'Martes'    },
  { key: 'Mié', label: 'Miércoles' },
  { key: 'Jue', label: 'Jueves'    },
  { key: 'Vie', label: 'Viernes'   },
]

const MAE_BUCKETS = [
  { label: '< 10 pts',    labelUsd: '< $200',      min: 0,       max: 200,  pct: 100, avgPnl: 1400,  emoji: '🟢' },
  { label: '10–25 pts',   labelUsd: '$200–$500',    min: 200,     max: 500,  pct: 100, avgPnl: 1250,  emoji: '🟢' },
  { label: '25–50 pts',   labelUsd: '$500–$1,000',  min: 500,     max: 1000, pct: 100, avgPnl: 1200,  emoji: '🟡' },
  { label: '> 50 pts ⚠️', labelUsd: '> $1,000',    min: 1000,    max: null, pct: 4,   avgPnl: -1134, emoji: '🔴' },
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

export default function BreakoutPage() {
  const [sessions, setSessions]     = useState<Session[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeDay, setActiveDay]   = useState<string>(() => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const d = days[new Date().getDay()]
    return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].includes(d) ? d : 'Lun'
  })
  const [maeInput, setMaeInput]     = useState<string>('')
  const [now, setNow]               = useState(new Date())
  const [signalLogs, setSignalLogs] = useState<SignalLog[]>([])
  const [logSaved, setLogSaved]     = useState(false)
  const [logOutcome, setLogOutcome] = useState<string>('')
  const [savingLog, setSavingLog]   = useState(false)
  const [pendingLogId, setPendingLogId] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch('/api/sessions?strategy=breakout_v4')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSessions(data.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha)))
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

  const { h: nyH, m: nyM, totalMin: nyMin } = getNYTime(now)
  const inSession = nyMin >= SESSION_START && nyMin < SESSION_END

  // ── Pre-sesión ──
  if (!inSession) {
    const nyDowStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
    const isWeekend = nyDowStr === 'Sat' || nyDowStr === 'Sun'
    let minsLeft: number
    if (isWeekend) {
      const nyDow = nyDowStr === 'Sun' ? 0 : 6
      const daysUntilMon = nyDow === 0 ? 1 : 2
      minsLeft = daysUntilMon * 24 * 60 - nyMin + SESSION_START
    } else if (nyMin < SESSION_START) {
      minsLeft = SESSION_START - nyMin
    } else {
      const extraDays = nyDowStr === 'Fri' ? 3 : 1
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
            BK es automatizado vía TradersPost · Esta herramienta es para override manual
          </p>
        </div>
      </div>
    )
  }

  // ── Cálculos ──
  const daySessions = sessions.filter(s => normDay(s.dia) === activeDay)
  const wins    = daySessions.filter(s => (s.cierre ?? 0) >= 0).length
  const winRate = daySessions.length > 0 ? Math.round(wins / daySessions.length * 100) : 0
  const avgPnl  = daySessions.length > 0
    ? Math.round(daySessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / daySessions.length)
    : 0

  const maeUsd   = parseFloat(maeInput)
  const maeVal   = isNaN(maeUsd) || maeUsd < 0 ? null : maeUsd
  const decision = getDecision(inSession, maeVal)
  const ds       = DEC[decision]

  // Valor esperado combo actual (día × hora)
  const evNow = (EV_MATRIX[activeDay]?.[nyH]) ?? { n: 0, avg: 0 }
  const currentHourLabel = toHourLabel(nyH)
  const timeStr = `${String(nyH).padStart(2,'0')}:${String(nyM).padStart(2,'0')} NY`
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  // Horas ordenadas por valor esperado
  const dayMatrix = EV_MATRIX[activeDay] ?? {}
  const hourStats = Object.entries(dayMatrix)
    .filter(([, v]) => v.n >= 3)
    .map(([h, v]) => ({ h: parseInt(h), label: toHourLabel(parseInt(h)), n: v.n, avg: v.avg }))
    .sort((a, b) => b.avg - a.avg)
  const top3Labels = new Set(hourStats.slice(0, 3).map(h => h.label))

  // Bucket activo
  const activeBucket = maeVal !== null
    ? MAE_BUCKETS.find(b => maeVal >= b.min && (b.max === null || maeVal < b.max)) ?? null
    : null

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚡ Breakout v4 · Vivo</h1>
          <p className="text-xs text-zinc-500 capitalize">{dateStr} · Automatizado</p>
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

      {/* Valor esperado combo actual */}
      <div className={`rounded-2xl border p-4 ${
        evNow.n >= 5 ? 'bg-blue-500/8 border-blue-500/60' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-base font-bold leading-snug ${evNow.n >= 5 ? 'text-blue-400' : 'text-zinc-300'}`}>
              {evNow.n >= 5
                ? `💰 ${activeDay} ${currentHourLabel} — EV +$${evNow.avg.toLocaleString()} (${evNow.n}t)`
                : evNow.n > 0
                ? `${activeDay} ${currentHourLabel} — +$${evNow.avg.toLocaleString()} (${evNow.n}t, muestra pequeña)`
                : `${activeDay} ${currentHourLabel} — sin datos suficientes`}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Valor esperado si MAE ≤ 50pts · Top: {hourStats.slice(0,3).map(h => `${h.label} ($${(h.avg/1000).toFixed(1)}k)`).join(', ')}
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
                key={h.h}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                  h.label === currentHourLabel
                    ? 'bg-blue-500 text-white'
                    : top3Labels.has(h.label)
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {h.label} <span className="opacity-70">${(h.avg/1000).toFixed(1)}k</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Input MAE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-sm font-semibold text-zinc-300 mb-1">MAE del trade activo</p>
        <p className="text-xs text-zinc-500 mb-4">
          USD adverso desde entrada · Umbral: $1,000 = 50pts SL (10 MNQ · $20/pt) · $0 sin trade activo
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
                : maeVal >= SL_USD
                ? 'border-red-500'
                : maeVal >= 500
                ? 'border-amber-500'
                : 'border-emerald-500'
            }`}
          />
        </div>
        {maeInput && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-zinc-500">
              {activeBucket
                ? `${activeBucket.emoji} ${activeBucket.label} · ${activeBucket.pct}% win histórico · avg ${activeBucket.avgPnl >= 0 ? '+' : ''}$${activeBucket.avgPnl.toLocaleString()}`
                : '—'}
            </p>
            <button onClick={() => setMaeInput('')} className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors">
              ✕ limpiar
            </button>
          </div>
        )}
      </div>

      {/* Decisión principal */}
      <div className={`rounded-2xl border-2 p-7 text-center ${ds.bg} ${ds.border}`}>
        <p className={`text-4xl font-black tracking-tight ${ds.text}`}>{ds.label}</p>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{ds.sub}</p>
        {decision === 'DEJAR' && evNow.n >= 3 && (
          <p className="text-emerald-400 font-bold text-xl mt-4">
            EV este combo: +${evNow.avg.toLocaleString()} USD
          </p>
        )}
        <div className="flex justify-center gap-5 mt-5 text-xs text-zinc-500">
          <span className="flex flex-col items-center gap-1">
            <span className={`text-base font-bold ${
              maeVal === null ? 'text-zinc-600'
              : maeVal >= SL_USD ? 'text-red-400'
              : maeVal >= 500 ? 'text-amber-400'
              : 'text-emerald-400'
            }`}>
              {maeVal !== null ? `$${maeVal.toLocaleString()}` : '—'}
            </span>
            <span>MAE USD</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex flex-col items-center gap-1">
            <span className={`text-base font-bold ${
              maeVal !== null ? (maeVal < SL_USD ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-600'
            }`}>
              {maeVal !== null ? (maeVal < SL_USD ? '100%' : '4%') : '—'}
            </span>
            <span>win hist.</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex flex-col items-center gap-1">
            <span className="text-base">{winRate}%</span>
            <span>{activeDay} total</span>
          </span>
        </div>
      </div>

      {/* Tabla MAE mecánica BK */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">
          Adversidad → Decisión · BK v4 (SL = 50pts, trailing stop)
        </p>
        <div className="space-y-2.5">
          {MAE_BUCKETS.map(b => {
            const isActive = activeBucket?.label === b.label
            return (
              <div key={b.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                isActive ? 'bg-zinc-700 ring-2 ring-blue-500' : ''
              } ${b.min >= SL_USD ? 'border border-red-500/20' : ''}`}>
                <div className="w-24 shrink-0">
                  <span className="text-xs font-mono text-zinc-300 block leading-tight">{b.label}</span>
                  <span className="text-xs font-mono text-zinc-600">{b.labelUsd}</span>
                </div>
                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.pct >= 70 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
                <span className={`text-sm font-black w-10 text-right shrink-0 ${b.pct >= 70 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.pct}%
                </span>
                <span className={`text-xs w-18 text-right font-mono shrink-0 ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.avgPnl >= 0 ? '+' : ''}${b.avgPnl.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">10 MNQ · $20/pt total · SL = 50pts = $1,000 · Trailing stop salida</p>
      </div>

      {/* Stats del día */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs text-zinc-500 mb-2">📊 {activeDay} histórico</p>
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

      {/* Log de override */}
      {inSession && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-zinc-300">📝 Registrar override</p>

          {!pendingLogId && !logSaved && (
            <>
              <p className="text-xs text-zinc-500">¿Tomaste acción manual?</p>
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
                        signal: decision,
                        en_ventana: evNow.n >= 5,
                        entro: true,
                      }),
                    })
                    const d = await res.json()
                    setPendingLogId(d.id)
                    setSavingLog(false)
                  }}
                  disabled={savingLog}
                  className="py-3 rounded-xl bg-red-500/15 border border-red-500/50 text-red-400 font-bold text-sm active:bg-red-500/30"
                >
                  🔴 Cerré manual
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
                        signal: decision,
                        en_ventana: evNow.n >= 5,
                        entro: false,
                      }),
                    })
                    setLogSaved(true)
                    setSavingLog(false)
                  }}
                  disabled={savingLog}
                  className="py-3 rounded-xl bg-emerald-800/30 border border-emerald-700/50 text-emerald-400 font-bold text-sm active:bg-emerald-800/50"
                >
                  ✅ Dejé correr
                </button>
              </div>
            </>
          )}

          {pendingLogId && !logSaved && (
            <>
              <p className="text-xs text-zinc-500">Resultado del override (USD):</p>
              <div className="flex gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="+500 o -300"
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
              <p className="text-blue-400 font-semibold">✓ Override registrado</p>
              <button
                onClick={() => { setLogSaved(false); setPendingLogId(null); setLogOutcome('') }}
                className="text-xs text-zinc-600 hover:text-zinc-400 mt-1"
              >
                Registrar otro
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historial de overrides */}
      {signalLogs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">🗂 Últimos overrides registrados</p>
          <div className="space-y-2">
            {signalLogs.slice(0, 8).map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-500 font-mono w-20 shrink-0">{l.fecha}</span>
                <span className={`shrink-0 ${l.entro ? 'text-red-400' : 'text-emerald-400'}`}>
                  {l.entro ? '🔴' : '✅'}
                </span>
                <span className="text-zinc-400 shrink-0">{l.dia}</span>
                <span className="text-zinc-600 shrink-0">{l.hora}</span>
                <span className="text-zinc-600 font-mono shrink-0">${l.pullback_pts}</span>
                <span className="text-zinc-600 shrink-0">{l.entro ? 'cerró' : 'dejó correr'}</span>
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
