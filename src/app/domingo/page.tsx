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

function getNYTime(now: Date) {
  const str = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
  const [, timePart] = str.split(', ')
  const parts = timePart.split(':').map(Number)
  const h = parts[0] === 24 ? 0 : parts[0]
  const m = parts[1]
  const dow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay()
  return { h, m, totalMin: h * 60 + m, dow }
}

const SE_OPEN_MIN  = 18 * 60
const SE_CLOSE_MIN = 16 * 60 + 15

function isSEActive(totalMin: number, dow: number): boolean {
  const afterOpen   = totalMin >= SE_OPEN_MIN
  const beforeClose = totalMin < SE_CLOSE_MIN
  if (dow === 0) return afterOpen
  if (dow === 1 || dow === 2) return afterOpen || beforeClose
  if (dow === 3) return beforeClose
  return false
}

function minsToNextSEOpen(totalMin: number, dow: number): number {
  if ((dow === 0 || dow === 1 || dow === 2) && totalMin < SE_OPEN_MIN) {
    return SE_OPEN_MIN - totalMin
  }
  const daysUntilSun = (7 - dow) % 7 || 7
  return daysUntilSun * 24 * 60 - totalMin + SE_OPEN_MIN
}

const HOUR_ORDER = [
  '12AM','1AM','2AM','3AM','4AM','5AM','6AM','7AM','8AM','9AM','10AM','11AM',
  '12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM',
]

const DAYS_LIST = [
  { key: 'Dom', label: 'Domingo' },
  { key: 'Mar', label: 'Martes'  },
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
  created_at: string
}

function PullbackTable({
  buckets,
  matched,
  isDom,
}: {
  buckets: ReturnType<typeof calcPullbackDepthBuckets>
  matched: ReturnType<typeof calcPullbackDepthBuckets>[0] | null
  isDom: boolean
}) {
  return (
    <div className="space-y-2">
      {buckets.map(b => {
        const isActive = matched?.label === b.label
        return (
          <div
            key={b.label}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
              isActive
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
  )
}

export default function EnVivoPage() {
  const [sessions, setSessions]   = useState<Session[]>([])
  const [loading, setLoading]     = useState(true)

  // ── localStorage: persiste día entre refreshes ───────────────────────────
  const [activeDay, setActiveDayState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('se_activeDay')
      if (saved && ['Dom', 'Mar'].includes(saved)) return saved
    }
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const d = days[new Date().getDay()]
    return d === 'Mar' ? 'Mar' : 'Dom'
  })
  const setActiveDay = (d: string) => {
    localStorage.setItem('se_activeDay', d)
    setActiveDayState(d)
  }

  const [pullback, setPullback]         = useState('')
  const [now, setNow]                   = useState(new Date())
  const [signalLogs, setSignalLogs]     = useState<SignalLog[]>([])
  const [logSaved, setLogSaved]         = useState(false)
  const [logOutcome, setLogOutcome]     = useState('')
  const [savingLog, setSavingLog]       = useState(false)
  const [pendingLogId, setPendingLogId] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
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

  const { h: nyH, m: nyM, totalMin: nyMin, dow: nyDow } = getNYTime(now)
  const seActive = isSEActive(nyMin, nyDow)

  // Calculos de pullback para Dom y Mar (para pre-sesión)
  const bucketsDom = calcPullbackDepthBuckets(sessions, 'Dom')
  const bucketsMar = calcPullbackDepthBuckets(sessions, 'Mar')

  // Stats generales por día (para pre-sesión y day selector)
  const domSessions = sessions.filter(s => normDay(s.dia) === 'Dom')
  const marSessions = sessions.filter(s => normDay(s.dia) === 'Mar')
  const domWins = domSessions.filter(s => (s.cierre ?? 0) >= 0).length
  const marWins = marSessions.filter(s => (s.cierre ?? 0) >= 0).length
  const domWR = domSessions.length > 0 ? Math.round(domWins / domSessions.length * 100) : 0
  const marWR = marSessions.length > 0 ? Math.round(marWins / marSessions.length * 100) : 0

  // ── Pre-sesión ─────────────────────────────────────────────────────────────
  if (!seActive) {
    const minsLeft = minsToNextSEOpen(nyMin, nyDow)
    const dLeft = Math.floor(minsLeft / (60 * 24))
    const hLeft = Math.floor((minsLeft % (60 * 24)) / 60)
    const mLeft = minsLeft % 60

    return (
      <div className="max-w-lg mx-auto space-y-4 pb-8">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center">
          <p className="text-5xl">⏳</p>
          <div>
            <p className="text-2xl font-black text-zinc-200">Sin sesión activa</p>
            <p className="text-zinc-500 mt-1 text-sm">Session Edge · Dom/Lun/Mar 6:00 PM – 4:15 PM NY</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-10 py-6">
            <p className="text-5xl font-mono font-black text-emerald-400">
              {dLeft > 0 ? `${dLeft}d ` : ''}{hLeft}h {String(mLeft).padStart(2, '0')}m
            </p>
            <p className="text-xs text-zinc-500 mt-2">para el próximo open</p>
          </div>
        </div>

        {/* Stats resumen */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-1">🌟 Domingos</p>
            <p className="text-3xl font-black text-emerald-400">{domWR}%</p>
            <p className="text-xs text-zinc-600">{domSessions.length} sesiones</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-1">📈 Martes</p>
            <p className="text-3xl font-black text-blue-400">{marWR}%</p>
            <p className="text-xs text-zinc-600">{marSessions.length} sesiones</p>
          </div>
        </div>

        {/* Referencia pullback Domingo */}
        {bucketsDom.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-3">
              📋 Pullback → Probabilidad · Domingos
            </p>
            <PullbackTable buckets={bucketsDom} matched={null} isDom={true} />
            <p className="text-xs text-zinc-600 mt-3">⚠️ &gt;150 pts — probabilidad se invierte</p>
          </div>
        )}

        {/* Referencia pullback Martes */}
        {bucketsMar.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-3">
              📋 Pullback → Probabilidad · Martes
            </p>
            <PullbackTable buckets={bucketsMar} matched={null} isDom={false} />
          </div>
        )}
      </div>
    )
  }

  // ── Sesión activa ─────────────────────────────────────────────────────────
  const daySessions = sessions.filter(s => normDay(s.dia) === activeDay)
  const buckets     = calcPullbackDepthBuckets(sessions, activeDay)
  const hourLow     = calcHourMapByDay(sessions, activeDay, 'hora_baja')
  const monthly     = calcMonthlyByDay(sessions, activeDay)

  // Horas ordenadas con datos (si las hay)
  const allHoursWithData = [...hourLow].sort(
    (a, b) => HOUR_ORDER.indexOf(a.hour) - HOUR_ORDER.indexOf(b.hour)
  )
  const topLowHours = [...hourLow].sort((a, b) => b.count - a.count).slice(0, 3)
  const hotLowSet   = new Set(topLowHours.map(h => h.hour))
  const hasHourData = allHoursWithData.length > 0

  const hourNow    = toHourLabel(now.getHours())
  const inWindow   = hotLowSet.has(hourNow)
  const hourLowNow = hourLow.find(h => h.hour === hourNow)

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

  // Mes histórico
  const sameMonthNum  = String(now.getMonth() + 1).padStart(2, '0')
  const thisMonthKey  = `${now.getFullYear()}-${sameMonthNum}`
  const historicMonth = monthly.filter(m => m.month.endsWith(`-${sameMonthNum}`) && m.month !== thisMonthKey)
  const historicAvg   = historicMonth.length > 0
    ? Math.round(historicMonth.reduce((a, m) => a + m.avgPnl, 0) / historicMonth.length)
    : null

  // Stats generales
  const wins    = daySessions.filter(s => (s.cierre ?? 0) >= 0).length
  const winRate = daySessions.length > 0 ? Math.round(wins / daySessions.length * 100) : 0
  const avgPts  = daySessions.length > 0
    ? Math.round(daySessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / daySessions.length)
    : 0

  const isDom   = activeDay === 'Dom'
  const timeStr = `${String(nyH).padStart(2,'0')}:${String(nyM).padStart(2,'0')} NY`
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  // Señal pullback
  const pullbackSignal = matched
    ? matched.winRate >= 70 ? (inWindow ? 'GO' : 'GO_OOW')
    : matched.winRate >= 50 ? 'CAUTION'
    : 'NO'
    : null

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚡ Session Edge · Vivo</h1>
          <p className="text-xs text-zinc-500 capitalize">{dateStr} · Manual</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-black text-emerald-400">{timeStr}</p>
          <p className="text-xs text-zinc-500">sesión activa</p>
        </div>
      </div>

      {/* Selector de día */}
      <div className="flex gap-3">
        {DAYS_LIST.map(d => {
          const s  = sessions.filter(x => normDay(x.dia) === d.key)
          const w  = s.filter(x => (x.cierre ?? 0) >= 0).length
          const wr = s.length > 0 ? Math.round(w / s.length * 100) : 0
          const active = activeDay === d.key
          return (
            <button
              key={d.key}
              onClick={() => { setActiveDay(d.key); setPullback('') }}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border-2 ${
                active
                  ? d.key === 'Dom'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                    : 'bg-blue-500/15 border-blue-500 text-blue-400'
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

      {/* SEMÁFORO PRINCIPAL — Pullback (señal real de SE) */}
      <div className={`rounded-2xl border-2 p-6 ${
        !matched                     ? 'bg-zinc-900 border-zinc-700'
        : pullbackSignal === 'GO'    ? 'bg-emerald-500/10 border-emerald-500'
        : pullbackSignal === 'GO_OOW'? 'bg-emerald-500/10 border-amber-400'
        : pullbackSignal === 'CAUTION'? 'bg-amber-500/10 border-amber-500'
        :                              'bg-red-500/10 border-red-500'
      }`}>
        <p className={`text-3xl font-black ${
          !matched                      ? 'text-zinc-500'
          : pullbackSignal === 'GO' || pullbackSignal === 'GO_OOW' ? 'text-emerald-400'
          : pullbackSignal === 'CAUTION' ? 'text-amber-400'
          : 'text-red-400'
        }`}>
          {!matched            ? '⏳  INTRODUCE PULLBACK'
          : pullbackSignal === 'GO'      ? '🟢  GO'
          : pullbackSignal === 'GO_OOW'  ? '🟢  GO  ⚠️'
          : pullbackSignal === 'CAUTION' ? '🟡  ESPERA'
          :                                '🔴  NO ENTRES'}
        </p>
        <p className="text-sm text-zinc-400 mt-2">
          {!matched
            ? 'Introduce el pullback desde el open para calcular tu señal'
            : pullbackSignal === 'GO'
            ? 'Pullback fuerte + hora activa — setup óptimo, entra'
            : pullbackSignal === 'GO_OOW'
            ? 'Pullback favorable pero fuera de ventana histórica — ok, sin agregar'
            : pullbackSignal === 'CAUTION'
            ? 'Condiciones mixtas — espera mejor setup o reduce tamaño'
            : 'Probabilidad histórica en tu contra — salta este trade'
          }
        </p>

        {matched && (
          <div className="mt-4 flex gap-4 border-t border-zinc-700 pt-4">
            <div>
              <p className="text-xs text-zinc-500">WR pullback</p>
              <p className={`text-2xl font-black ${matched.winRate >= 70 ? 'text-emerald-400' : matched.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {matched.winRate}%
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Avg pts</p>
              <p className={`text-2xl font-black ${matched.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {matched.avgPnl >= 0 ? '+' : ''}{matched.avgPnl}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">WR {activeDay}</p>
              <p className="text-2xl font-black text-zinc-300">{winRate}%</p>
            </div>
            {historicAvg !== null && (
              <div>
                <p className="text-xs text-zinc-500">Mes hist.</p>
                <p className={`text-2xl font-black ${historicAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {historicAvg >= 0 ? '+' : ''}{historicAvg}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input pullback */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto ha bajado desde el open?</p>
        <p className="text-xs text-zinc-500 mb-4">Puntos NQ de retroceso desde apertura</p>
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

      {/* Grid de horas — solo si hay datos */}
      {hasHourData && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">
            Ventanas de low · {isDom ? 'Domingos' : 'Martes'} — top 3 destacadas
          </p>
          <div className="flex gap-2 flex-wrap">
            {allHoursWithData.map(h => {
              const isTop     = hotLowSet.has(h.hour)
              const isCurrent = h.hour === hourNow
              return (
                <div
                  key={h.hour}
                  className={`rounded-xl px-3 py-2.5 text-center min-w-[52px] border-2 transition-all ${
                    isCurrent
                      ? isTop
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 scale-110'
                        : 'bg-zinc-700 border-zinc-500 text-zinc-300 scale-110'
                      : isTop
                      ? isDom
                        ? 'bg-emerald-500/8 border-emerald-500/30 text-emerald-400'
                        : 'bg-blue-500/8 border-blue-500/30 text-blue-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                  }`}
                >
                  <p className="text-xs font-mono font-bold">{h.hour}</p>
                  <p className="text-xs mt-0.5">{h.pct}%</p>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            {inWindow
              ? `✓ ${hourNow} es hora activa — ${hourLowNow?.pct ?? '—'}% de sesiones hacen low aquí`
              : nextWindow
                ? `Próxima ventana: ${nextWindow.hour} (${nextWindow.pct}%)`
                : ''
            }
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <p className="text-xs text-zinc-500 mb-1">WR {activeDay}</p>
          <p className={`text-2xl font-black ${isDom ? 'text-emerald-400' : 'text-blue-400'}`}>{winRate}%</p>
          <p className="text-xs text-zinc-600">{daySessions.length}t hist.</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Avg / sesión</p>
          <p className={`text-2xl font-black ${avgPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgPts >= 0 ? '+' : ''}{avgPts}
          </p>
          <p className="text-xs text-zinc-600">puntos</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Mes hist.</p>
          <p className={`text-2xl font-black ${
            historicAvg !== null ? (historicAvg >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-600'
          }`}>
            {historicAvg !== null ? `${historicAvg >= 0 ? '+' : ''}${historicAvg}` : '—'}
          </p>
          <p className="text-xs text-zinc-600">
            {historicMonth.length > 0 ? `${historicMonth.length} años` : 'sin datos'}
          </p>
        </div>
      </div>

      {/* Tabla pullback referencia */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3">
          Pullback → Probabilidad · {isDom ? 'Domingos' : 'Martes'}
        </p>
        <PullbackTable buckets={buckets} matched={matched} isDom={isDom} />
        <p className="text-xs text-zinc-600 mt-3">⚠️ &gt;150 pts — probabilidad se invierte</p>
      </div>

      {/* Log de decisión */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-zinc-300">📝 Registrar señal</p>

        {!pendingLogId && !logSaved && (
          <>
            <p className="text-xs text-zinc-500">¿Entraste al trade?</p>
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
                      hora: toHourLabel(now.getHours()),
                      pullback_pts: isNaN(pts) ? 0 : pts,
                      signal: pullbackSignal ?? 'CAUTION',
                      en_ventana: inWindow,
                      entro: true,
                    }),
                  })
                  const d = await res.json()
                  setPendingLogId(d.id)
                  setSavingLog(false)
                }}
                disabled={savingLog}
                className="py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/50 text-emerald-400 font-bold text-sm active:bg-emerald-500/30"
              >
                ✅ Sí, entré
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
                      hora: toHourLabel(now.getHours()),
                      pullback_pts: isNaN(pts) ? 0 : pts,
                      signal: pullbackSignal ?? 'CAUTION',
                      en_ventana: inWindow,
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
            <p className="text-xs text-zinc-500">¿Cuántos puntos resultó?</p>
            <div className="flex gap-3">
              <input
                type="number"
                inputMode="decimal"
                placeholder="+150 o -80"
                value={logOutcome}
                onChange={e => setLogOutcome(e.target.value)}
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
                  setLogSaved(true)
                  setPendingLogId(null)
                  setSavingLog(false)
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
            <p className="text-emerald-400 font-semibold">✓ Señal registrada</p>
            <button
              onClick={() => { setLogSaved(false); setPendingLogId(null); setLogOutcome('') }}
              className="text-xs text-zinc-600 hover:text-zinc-400 mt-1"
            >
              Registrar otra
            </button>
          </div>
        )}
      </div>

      {/* Historial */}
      {signalLogs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">🗂 Últimas señales</p>
          <div className="space-y-2">
            {signalLogs.slice(0, 6).map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-500 font-mono w-20 shrink-0">{l.fecha}</span>
                <span className={`shrink-0 ${l.signal === 'GO' ? 'text-emerald-400' : l.signal === 'NO' ? 'text-red-400' : 'text-amber-400'}`}>
                  {l.signal === 'GO' ? '🟢' : l.signal === 'NO' ? '🔴' : '🟡'}
                </span>
                <span className="text-zinc-400 shrink-0">{l.pullback_pts}pts</span>
                <span className="text-zinc-600 shrink-0">{l.entro ? 'Entró' : 'No entró'}</span>
                {l.outcome_pts !== null && (
                  <span className={`font-mono font-bold ml-auto shrink-0 ${l.outcome_pts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {l.outcome_pts >= 0 ? '+' : ''}{l.outcome_pts}
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
