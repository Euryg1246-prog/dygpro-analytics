'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'

// ── Filtro de horas basado en backtest 1,793 trades ──────────────────────────
// Slots con P&L total negativo = PAUSAR automatización
// Sin filtro: +$474k | Con filtro: +$521k (+$46k, 16% menos trades)
const PAUSE_SLOTS: Record<string, number[]> = {
  Lun: [14, 18, 19],   // -$18,596 combinado
  Mar: [],              // ✅ LIMPIO — ninguna hora mala
  Mié: [16],            // -$10,021
  Jue: [12, 15],        // -$10,538
  Vie: [11],            // -$4,810
}

// Valor esperado día×hora (MAE ≤ 50pts, 100% win histórico)
const EV_MATRIX: Record<string, Record<number, { n: number; avg: number }>> = {
  Lun: { 9:{n:46,avg:1516}, 10:{n:17,avg:1362}, 11:{n:19,avg:1320}, 12:{n:20,avg:1135}, 13:{n:23,avg:1157}, 15:{n:20,avg:1702}, 16:{n:9,avg:980} },
  Mar: { 9:{n:37,avg:1569}, 10:{n:31,avg:1431}, 11:{n:16,avg:1614}, 12:{n:17,avg:1473}, 13:{n:15,avg:1212}, 14:{n:19,avg:970}, 15:{n:27,avg:1144}, 16:{n:13,avg:1176}, 18:{n:7,avg:1507}, 19:{n:11,avg:1187} },
  Mié: { 9:{n:36,avg:1560}, 10:{n:23,avg:1449}, 11:{n:16,avg:993}, 12:{n:11,avg:1277}, 13:{n:16,avg:3213}, 14:{n:29,avg:1997}, 15:{n:20,avg:1173}, 18:{n:10,avg:1381}, 19:{n:6,avg:996} },
  Jue: { 9:{n:33,avg:1511}, 10:{n:20,avg:1295}, 11:{n:20,avg:1149}, 13:{n:27,avg:1573}, 14:{n:16,avg:1270}, 16:{n:7,avg:1740}, 18:{n:12,avg:1157}, 19:{n:6,avg:857} },
  Vie: { 9:{n:33,avg:1761}, 10:{n:26,avg:1284}, 12:{n:15,avg:1159}, 13:{n:16,avg:938}, 14:{n:12,avg:1128}, 15:{n:20,avg:1715} },
}

// Win rate real por slot (del backtest completo)
const WR_MATRIX: Record<string, Record<number, number>> = {
  Lun: { 9:57, 10:46, 11:63, 12:71, 13:70, 14:44, 15:54, 16:90, 18:39, 19:46 },
  Mar: { 9:55, 10:64, 11:59, 12:72, 13:60, 14:71, 15:74, 16:59, 18:70, 19:79 },
  Mié: { 9:54, 10:60, 11:57, 12:61, 13:59, 14:60, 15:61, 16:68, 18:59, 19:60 },
  Jue: { 9:52, 10:49, 11:57, 12:38, 13:75, 14:70, 15:47, 16:54, 18:75, 19:55 },
  Vie: { 9:56, 10:60, 11:44, 12:60, 13:73, 14:57, 15:58, 16:50 },
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
const SESSION_END   = 24 * 60 - 1

const DAYS_LIST = [
  { key: 'Lun', label: 'Lunes'     },
  { key: 'Mar', label: 'Martes'    },
  { key: 'Mié', label: 'Miércoles' },
  { key: 'Jue', label: 'Jueves'    },
  { key: 'Vie', label: 'Viernes'   },
]

const SESSION_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]

interface SignalLog {
  id: string; dia: string; fecha: string; hora: string
  pullback_pts: number; signal: string; en_ventana: boolean
  entro: boolean | null; outcome_pts: number | null; created_at: string
}

export default function BreakoutPage() {
  const [sessions, setSessions]     = useState<Session[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeDay, setActiveDayState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bk_activeDay')
      if (saved && ['Lun','Mar','Mié','Jue','Vie'].includes(saved)) return saved
    }
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const d = days[new Date().getDay()]
    return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].includes(d) ? d : 'Lun'
  })
  const setActiveDay = (d: string) => {
    localStorage.setItem('bk_activeDay', d)
    setActiveDayState(d)
  }
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
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-500 text-sm">Cargando...</p>
    </div>
  )

  const { h: nyH, m: nyM, totalMin: nyMin } = getNYTime(now)
  const inSession = nyMin >= SESSION_START && nyMin < SESSION_END

  // ── Pre-sesión ──────────────────────────────────────────────────────────────
  if (!inSession) {
    const nyDowStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
    const isWeekend = nyDowStr === 'Sat' || nyDowStr === 'Sun'
    let minsLeft: number
    if (isWeekend) {
      const nyDow = nyDowStr === 'Sun' ? 0 : 6
      minsLeft = (nyDow === 0 ? 1 : 2) * 24 * 60 - nyMin + SESSION_START
    } else if (nyMin < SESSION_START) {
      minsLeft = SESSION_START - nyMin
    } else {
      minsLeft = (nyDowStr === 'Fri' ? 3 : 1) * 24 * 60 - nyMin + SESSION_START
    }
    const dLeft = Math.floor(minsLeft / (60 * 24))
    const hLeft = Math.floor((minsLeft % (60 * 24)) / 60)
    const mLeft = minsLeft % 60

    // Mostrar preview del día siguiente
    const nyDayNorm = normDay(now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' }))
    const nextDay   = nyDayNorm === 'Vie' ? 'Lun' : (DAYS_LIST.find(d => d.key !== nyDayNorm)?.key ?? 'Lun')
    const pauseNext = PAUSE_SLOTS[nextDay] ?? []

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center">
          <p className="text-5xl">⏳</p>
          <div>
            <p className="text-2xl font-black text-zinc-200">Sin sesión activa</p>
            <p className="text-zinc-500 mt-1 text-sm">Breakout v4 · Lun–Vie 8:00 AM – 11:59 PM NY</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-10 py-6">
            <p className="text-5xl font-mono font-black text-emerald-400">
              {dLeft > 0 ? `${dLeft}d ` : ''}{hLeft}h {String(mLeft).padStart(2, '0')}m
            </p>
            <p className="text-xs text-zinc-500 mt-2">para el próximo open</p>
          </div>
        </div>

        {/* Preview del día siguiente */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">
            📋 Preparación para mañana · {nextDay}
          </p>
          <div className="flex gap-2 flex-wrap">
            {SESSION_HOURS.map(h => {
              const isPause = pauseNext.includes(h)
              const wr = WR_MATRIX[nextDay]?.[h]
              const ev = EV_MATRIX[nextDay]?.[h]
              return (
                <div key={h} className={`rounded-xl px-3 py-2 text-center min-w-[52px] border ${
                  isPause
                    ? 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}>
                  <p className="text-xs font-mono font-bold">{toHourLabel(h)}</p>
                  {isPause
                    ? <p className="text-xs opacity-60 mt-0.5">pausa</p>
                    : <p className="text-xs opacity-70 mt-0.5">{wr ?? '—'}%</p>
                  }
                  {!isPause && ev && <p className="text-xs font-mono opacity-60">${(ev.avg/1000).toFixed(1)}k</p>}
                </div>
              )
            })}
          </div>
          {pauseNext.length === 0
            ? <p className="text-xs text-emerald-400 mt-3">✅ {nextDay} es día limpio — todas las horas son válidas</p>
            : <p className="text-xs text-zinc-500 mt-3">⚠️ Pausar en: {pauseNext.map(h => toHourLabel(h)).join(', ')}</p>
          }
        </div>
      </div>
    )
  }

  // ── Cálculos sesión activa ──────────────────────────────────────────────────
  const daySessions = sessions.filter(s => normDay(s.dia) === activeDay)
  const wins    = daySessions.filter(s => (s.cierre ?? 0) >= 0).length
  const winRate = daySessions.length > 0 ? Math.round(wins / daySessions.length * 100) : 0
  const avgPnl  = daySessions.length > 0
    ? Math.round(daySessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / daySessions.length)
    : 0

  const isPauseNow = (PAUSE_SLOTS[activeDay] ?? []).includes(nyH)
  const evNow      = EV_MATRIX[activeDay]?.[nyH] ?? null
  const wrNow      = WR_MATRIX[activeDay]?.[nyH] ?? null
  const pauseToday = PAUSE_SLOTS[activeDay] ?? []

  const timeStr = `${String(nyH).padStart(2,'0')}:${String(nyM).padStart(2,'0')} NY`
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  const currentHourLabel = toHourLabel(nyH)

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚡ Breakout v4 · Vivo</h1>
          <p className="text-xs text-zinc-500 capitalize">{dateStr} · Automatizado</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-black text-emerald-400">{timeStr}</p>
          <p className="text-xs text-zinc-500">sesión activa</p>
        </div>
      </div>

      {/* Selector de día */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {DAYS_LIST.map(d => {
          const s     = sessions.filter(x => normDay(x.dia) === d.key)
          const w     = s.filter(x => (x.cierre ?? 0) >= 0).length
          const wr    = s.length > 0 ? Math.round(w / s.length * 100) : 0
          const pause = PAUSE_SLOTS[d.key] ?? []
          const active = activeDay === d.key
          return (
            <button
              key={d.key}
              onClick={() => setActiveDay(d.key)}
              className={`flex-1 min-w-[64px] py-3 rounded-2xl font-bold text-sm transition-all border-2 shrink-0 ${
                active
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 active:bg-zinc-800'
              }`}
            >
              {d.label.slice(0, 3)}
              <span className={`block text-xs font-normal mt-0.5 ${active ? 'opacity-80' : 'opacity-50'}`}>
                {wr}%{pause.length > 0 ? ` · ${pause.length}✗` : ' ✅'}
              </span>
            </button>
          )
        })}
      </div>

      {/* SEMÁFORO PRINCIPAL */}
      <div className={`rounded-2xl border-2 p-6 ${
        isPauseNow
          ? 'bg-red-500/10 border-red-500'
          : 'bg-emerald-500/10 border-emerald-500'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-3xl font-black ${isPauseNow ? 'text-red-400' : 'text-emerald-400'}`}>
              {isPauseNow ? '🔴  PAUSAR' : '🟢  DEJAR CORRER'}
            </p>
            <p className="text-sm text-zinc-400 mt-2">
              {isPauseNow
                ? `${activeDay} ${currentHourLabel} es slot negativo histórico — pausa la automatización`
                : `${activeDay} ${currentHourLabel} es slot válido — deja que TradersPost opere`
              }
            </p>
          </div>
        </div>

        {!isPauseNow && (
          <div className="mt-4 flex gap-4 border-t border-emerald-500/20 pt-4">
            <div>
              <p className="text-xs text-zinc-500">WR histórico</p>
              <p className="text-2xl font-black text-emerald-400">{wrNow ?? '—'}%</p>
            </div>
            {evNow && evNow.n >= 3 && (
              <div>
                <p className="text-xs text-zinc-500">EV esperado</p>
                <p className="text-2xl font-black text-emerald-400">+${evNow.avg.toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-zinc-500">{activeDay} total</p>
              <p className="text-2xl font-black text-zinc-300">{winRate}%</p>
            </div>
          </div>
        )}

        {isPauseNow && (
          <div className="mt-4 border-t border-red-500/20 pt-4">
            <p className="text-xs text-zinc-500">
              Próximo slot válido: <span className="text-zinc-300 font-semibold">
                {(() => {
                  const pause = PAUSE_SLOTS[activeDay] ?? []
                  const next  = SESSION_HOURS.find(h => h > nyH && !pause.includes(h))
                  return next ? toHourLabel(next) : '—'
                })()}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Grid de horas del día */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">
          Horas {activeDay} · {pauseToday.length === 0 ? '✅ Día limpio — todas las horas válidas' : `${pauseToday.map(h => toHourLabel(h)).join(', ')} pausadas`}
        </p>
        <div className="flex gap-2 flex-wrap">
          {SESSION_HOURS.map(h => {
            const isPause  = pauseToday.includes(h)
            const isCurrent = h === nyH
            const wr  = WR_MATRIX[activeDay]?.[h]
            const ev  = EV_MATRIX[activeDay]?.[h]
            return (
              <div
                key={h}
                className={`rounded-xl px-3 py-2.5 text-center min-w-[56px] border-2 transition-all ${
                  isCurrent
                    ? isPause
                      ? 'bg-red-500/20 border-red-500 text-red-300 scale-110'
                      : 'bg-emerald-500/20 border-emerald-500 text-emerald-300 scale-110'
                    : isPause
                    ? 'bg-red-500/8 border-red-500/30 text-red-500'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                <p className="text-xs font-mono font-bold">{toHourLabel(h)}</p>
                {isPause
                  ? <p className="text-xs opacity-70 mt-0.5">✗ pausa</p>
                  : <>
                      <p className="text-xs mt-0.5">{wr ?? '—'}%</p>
                      {ev && <p className="text-xs opacity-60">${(ev.avg/1000).toFixed(1)}k</p>}
                    </>
                }
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats del día */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <p className="text-xs text-zinc-500 mb-1">WR {activeDay}</p>
          <p className="text-2xl font-black text-blue-400">{winRate}%</p>
          <p className="text-xs text-zinc-600">{daySessions.length}t hist.</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Avg / trade</p>
          <p className={`text-2xl font-black ${avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgPnl >= 0 ? '+' : ''}${Math.abs(avgPnl)}
          </p>
          <p className="text-xs text-zinc-600">backtest</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Slots pausa</p>
          <p className={`text-2xl font-black ${pauseToday.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {pauseToday.length === 0 ? '0 ✅' : pauseToday.length}
          </p>
          <p className="text-xs text-zinc-600">horas malas</p>
        </div>
      </div>

      {/* Log de override */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-zinc-300">📝 Registrar acción</p>

        {!pendingLogId && !logSaved && (
          <>
            <p className="text-xs text-zinc-500">¿Tomaste alguna acción manual?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  setSavingLog(true)
                  const res = await fetch('/api/signals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      dia: activeDay,
                      fecha: now.toISOString().slice(0, 10),
                      hora: currentHourLabel,
                      pullback_pts: 0,
                      signal: isPauseNow ? 'PAUSA' : 'DEJAR',
                      en_ventana: !isPauseNow,
                      entro: true,
                    }),
                  })
                  const d = await res.json()
                  setPendingLogId(d.id)
                  setSavingLog(false)
                }}
                disabled={savingLog}
                className="py-3 rounded-xl bg-red-500/15 border border-red-500/50 text-red-400 font-bold text-sm"
              >
                🔴 Cerré manual
              </button>
              <button
                onClick={async () => {
                  setSavingLog(true)
                  await fetch('/api/signals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      dia: activeDay,
                      fecha: now.toISOString().slice(0, 10),
                      hora: currentHourLabel,
                      pullback_pts: 0,
                      signal: isPauseNow ? 'PAUSA' : 'DEJAR',
                      en_ventana: !isPauseNow,
                      entro: false,
                    }),
                  })
                  setLogSaved(true)
                  setSavingLog(false)
                }}
                disabled={savingLog}
                className="py-3 rounded-xl bg-emerald-800/30 border border-emerald-700/50 text-emerald-400 font-bold text-sm"
              >
                ✅ Dejé correr
              </button>
            </div>
          </>
        )}

        {pendingLogId && !logSaved && (
          <>
            <p className="text-xs text-zinc-500">Resultado (USD):</p>
            <div className="flex gap-3">
              <input
                type="number" inputMode="decimal" placeholder="+800 o -1000"
                value={logOutcome} onChange={e => setLogOutcome(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-mono font-bold text-zinc-100 focus:outline-none focus:border-emerald-500"
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
                  setLogSaved(true); setPendingLogId(null); setSavingLog(false)
                }}
                disabled={savingLog || !logOutcome}
                className="px-4 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-40"
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
            <p className="text-emerald-400 font-semibold">✓ Registrado</p>
            <button
              onClick={() => { setLogSaved(false); setPendingLogId(null); setLogOutcome('') }}
              className="text-xs text-zinc-600 hover:text-zinc-400 mt-1"
            >
              Registrar otro
            </button>
          </div>
        )}
      </div>

      {/* Historial */}
      {signalLogs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">🗂 Últimas acciones</p>
          <div className="space-y-2">
            {signalLogs.slice(0, 6).map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-500 font-mono w-20 shrink-0">{l.fecha}</span>
                <span className={l.entro ? 'text-red-400' : 'text-emerald-400'}>
                  {l.entro ? '🔴' : '✅'}
                </span>
                <span className="text-zinc-400 shrink-0">{l.dia}</span>
                <span className="text-zinc-600 shrink-0">{l.hora}</span>
                <span className="text-zinc-600 shrink-0">{l.entro ? 'cerró' : 'dejó correr'}</span>
                {l.outcome_pts !== null && (
                  <span className={`font-mono font-bold ml-auto shrink-0 ${l.outcome_pts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {l.outcome_pts >= 0 ? '+$' : '-$'}{Math.abs(l.outcome_pts)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
