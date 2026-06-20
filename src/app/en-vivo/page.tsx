'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'
import { calcPullbackDepthBuckets, calcHourMapByDay, calcMonthlyByDay } from '@/lib/calc'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normDay(d: string) {
  const map: Record<string, string> = {
    'Sun': 'Dom', 'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié',
    'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb',
    'Domingo': 'Dom', 'Lunes': 'Lun', 'Martes': 'Mar',
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

// Session Edge: 6PM – 4:15PM siguiente día (overnight)
// En minutos: 18:00 (1080) hasta fin de día, luego 0:00 hasta 16:15 (975)
const SE_OPEN  = 18 * 60       // 1080
const SE_CLOSE = 16 * 60 + 15 // 975

// Breakout v4: 9:30AM – 3:30PM NY
const BK_START = 9 * 60 + 30   // 570
const BK_END   = 15 * 60 + 30  // 930

function isSESession(nyMin: number, nyDow: number): boolean {
  // Dom(0)/Lun(1)/Mar(2) — después de las 6PM o antes de las 4:15PM
  const validDay = nyDow === 0 || nyDow === 1 || nyDow === 2
  if (!validDay) return false
  return nyMin >= SE_OPEN || nyMin < SE_CLOSE
}

function isBKSession(nyMin: number, nyDow: number): boolean {
  // Lun-Vie (1-5)
  if (nyDow < 1 || nyDow > 5) return false
  return nyMin >= BK_START && nyMin < BK_END
}

// ── SE Signal ─────────────────────────────────────────────────────────────────

type SESignal = 'GO' | 'GO_OOW' | 'CAUTION' | 'NO'

function getSESignal(winRate: number | null, inWindow: boolean, monthAvg: number | null): SESignal {
  if (winRate === null) return 'CAUTION'
  if (winRate < 35) return 'NO'
  if (winRate >= 80) return (monthAvg === null || monthAvg >= 0) ? 'GO' : 'GO_OOW'
  if (winRate >= 60 && inWindow) return 'GO'
  if (winRate >= 60) return 'GO_OOW'
  return 'CAUTION'
}

const SE_SIG: Record<SESignal, { bg: string; border: string; text: string; label: string; sub: string }> = {
  GO:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400',
             label: '🟢  GO', sub: 'Pullback favorable + en ventana de hora — entra' },
  GO_OOW:  { bg: 'bg-emerald-500/10', border: 'border-amber-400',   text: 'text-emerald-400',
             label: '🟢  GO  ⚠️', sub: 'Pullback favorable pero fuera de ventana — tamaño normal, sin agregar' },
  CAUTION: { bg: 'bg-amber-500/10',   border: 'border-amber-500',   text: 'text-amber-400',
             label: '🟡  ESPERA', sub: 'Condiciones mixtas — espera mejor setup o reduce tamaño' },
  NO:      { bg: 'bg-red-500/10',     border: 'border-red-500',     text: 'text-red-400',
             label: '🔴  NO ENTRES', sub: 'Probabilidad histórica en tu contra — salta este trade' },
}

// ── BK Signal ─────────────────────────────────────────────────────────────────

type BKSignal = 'GO' | 'GO_OOW' | 'CAUTION' | 'DANGER'

function getBKSignal(inBestHour: boolean, maeUsd: number | null): BKSignal {
  if (maeUsd !== null && maeUsd >= 500) return 'DANGER'
  if (maeUsd !== null && maeUsd >= 250) return 'CAUTION'
  if (inBestHour) return 'GO'
  return 'GO_OOW'
}

const BK_SIG: Record<BKSignal, { bg: string; border: string; text: string; label: string; sub: string }> = {
  GO:      { bg: 'bg-blue-500/10',   border: 'border-blue-500',   text: 'text-blue-400',
             label: '🔵  GO', sub: 'Ventana óptima activa — vigila los setups con breakout limpio' },
  GO_OOW:  { bg: 'bg-blue-500/10',   border: 'border-amber-400',  text: 'text-blue-400',
             label: '🔵  GO  ⚠️', sub: 'Sesión activa pero fuera de la mejor ventana — ok si el setup es claro' },
  CAUTION: { bg: 'bg-amber-500/10',  border: 'border-amber-500',  text: 'text-amber-400',
             label: '🟡  ATENCIÓN', sub: 'MAE entre $250–$500 — evalúa salida parcial' },
  DANGER:  { bg: 'bg-red-500/10',    border: 'border-red-500',    text: 'text-red-400',
             label: '🔴  PELIGRO', sub: 'MAE ≥ $500 — zona de colapso histórico (3.2% win). Salida manual.' },
}

const SE_DAYS = [{ key: 'Dom', label: '🌟 Dom' }, { key: 'Mar', label: '📈 Mar' }]
const BK_DAYS = [
  { key: 'Lun', label: 'Lun' }, { key: 'Mar', label: 'Mar' },
  { key: 'Mié', label: 'Mié' }, { key: 'Jue', label: 'Jue' },
  { key: 'Vie', label: 'Vie' },
]

const HOUR_ORDER = ['12AM','1AM','2AM','3AM','4AM','5AM','6AM','7AM','8AM',
  '9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM',
  '6PM','7PM','8PM','9PM','10PM','11PM']

interface SignalLog {
  id: string; dia: string; fecha: string; hora: string
  pullback_pts: number; signal: string; en_ventana: boolean
  entro: boolean | null; outcome_pts: number | null
  notas: string | null; created_at: string
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EnVivoPage() {
  const [seSessions, setSeSessions] = useState<Session[]>([])
  const [bkSessions, setBkSessions] = useState<Session[]>([])
  const [loading, setLoading]       = useState(true)
  const [now, setNow]               = useState(new Date())

  // Active tab: 'auto' | 'se' | 'bk'
  const [tab, setTab] = useState<'auto' | 'se' | 'bk'>('auto')

  // SE state
  const [seDay, setSeDay]       = useState<string>('Dom')
  const [pullback, setPullback] = useState<string>('')

  // BK state
  const [bkDay, setBkDay]       = useState<string>(() => {
    const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
    const d = days[new Date().getDay()]
    return ['Lun','Mar','Mié','Jue','Vie'].includes(d) ? d : 'Lun'
  })
  const [maeInput, setMaeInput] = useState<string>('')

  // Signal log
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
    Promise.all([
      fetch('/api/sessions?strategy=session_edge').then(r => r.json()),
      fetch('/api/sessions?strategy=breakout_v4').then(r => r.json()),
    ]).then(([se, bk]) => {
      if (Array.isArray(se)) setSeSessions(se.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha)))
      if (Array.isArray(bk)) setBkSessions(bk.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha)))
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
      <div className="w-8 h-8 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-500 text-sm">Cargando...</p>
    </div>
  )

  // ── Time ──
  const { h: nyH, m: nyM, totalMin: nyMin } = getNYTime(now)
  const nyDow = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
    .replace('Sun','0').replace('Mon','1').replace('Tue','2').replace('Wed','3')
    .replace('Thu','4').replace('Fri','5').replace('Sat','6'))

  const seActive = isSESession(nyMin, nyDow)
  const bkActive = isBKSession(nyMin, nyDow)

  // Resolve which tool to show
  const showSE = tab === 'se' || (tab === 'auto' && seActive) || (tab === 'auto' && !bkActive && !seActive && true)
  const showBK = tab === 'bk' || (tab === 'auto' && bkActive && !seActive)

  const activeTab = tab === 'auto'
    ? (bkActive ? 'bk' : seActive ? 'se' : 'se')  // fuera de horario → SE por defecto
    : tab

  const timeStr = `${String(nyH).padStart(2,'0')}:${String(nyM).padStart(2,'0')} NY`
  const dateStr = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── SE Calculations ──────────────────────────────────────────────────────────
  const seDay_sessions = seSessions.filter(s => normDay(s.dia) === seDay)
  const seBuckets      = calcPullbackDepthBuckets(seSessions, seDay)
  const seHourLow      = calcHourMapByDay(seSessions, seDay, 'hora_baja')
  const seHourHigh     = calcHourMapByDay(seSessions, seDay, 'hora_pico')
  const seMonthly      = calcMonthlyByDay(seSessions, seDay)

  const seTopLow     = [...seHourLow].sort((a, b) => b.count - a.count).slice(0, 3)
  const seTopHigh    = [...seHourHigh].sort((a, b) => b.count - a.count).slice(0, 3)
  const seHotLowSet  = new Set(seTopLow.map(h => h.hour))
  const seHourNow    = toHourLabel(nyH)
  const seInWindow   = seHotLowSet.has(seHourNow)
  const seHourLowNow = seHourLow.find(h => h.hour === seHourNow)
  const seHourHiNow  = seHourHigh.find(h => h.hour === seHourNow)

  const seNowIdx    = HOUR_ORDER.indexOf(seHourNow)
  const seNextWin   = !seInWindow
    ? seTopLow.map(h => ({ ...h, idx: HOUR_ORDER.indexOf(h.hour) }))
        .filter(h => h.idx > seNowIdx).sort((a, b) => a.idx - b.idx)[0] ?? seTopLow[0]
    : null

  const sePts     = parseFloat(pullback)
  const seMatched = isNaN(sePts) ? null : seBuckets.find(b =>
    sePts >= b.minPts && (b.maxPts === null || sePts < b.maxPts)
  ) ?? null

  const seMonthNum   = String(now.getMonth() + 1).padStart(2, '0')
  const thisMonthKey = `${now.getFullYear()}-${seMonthNum}`
  const seHistMonth  = seMonthly.filter(m => m.month.endsWith(`-${seMonthNum}`) && m.month !== thisMonthKey)
  const seHistAvg    = seHistMonth.length > 0
    ? Math.round(seHistMonth.reduce((a, m) => a + m.avgPnl, 0) / seHistMonth.length) : null
  const seThisMonth  = seMonthly.find(m => m.month === thisMonthKey) ?? null

  const seWins    = seDay_sessions.filter(s => (s.cierre ?? 0) >= 0).length
  const seWinRate = seDay_sessions.length > 0 ? Math.round(seWins / seDay_sessions.length * 100) : 0
  const seAvgPts  = seDay_sessions.length > 0
    ? Math.round(seDay_sessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / seDay_sessions.length) : 0

  const seSignal = getSESignal(seMatched?.winRate ?? null, seInWindow, seHistAvg)
  const seSS     = SE_SIG[seSignal]

  // ── BK Calculations ──────────────────────────────────────────────────────────
  const bkDay_sessions = bkSessions.filter(s => normDay(s.dia) === bkDay)

  const bkHourMap: Record<string, { t: number; w: number; total: number }> = {}
  for (const s of bkDay_sessions) {
    if (!s.hora_baja) continue
    const h = parseInt(s.hora_baja.split(':')[0])
    const lbl = toHourLabel(h)
    if (!bkHourMap[lbl]) bkHourMap[lbl] = { t: 0, w: 0, total: 0 }
    bkHourMap[lbl].t++
    bkHourMap[lbl].total += s.cierre ?? 0
    if ((s.cierre ?? 0) >= 0) bkHourMap[lbl].w++
  }
  const BK_SESSION_HOURS = ['9AM','10AM','11AM','12PM','1PM','2PM','3PM']
  const bkHourStats = BK_SESSION_HOURS
    .filter(h => bkHourMap[h] && bkHourMap[h].t >= 3)
    .map(h => ({
      hour: h, trades: bkHourMap[h].t,
      winRate: Math.round(bkHourMap[h].w / bkHourMap[h].t * 100),
      avgPnl:  Math.round(bkHourMap[h].total / bkHourMap[h].t),
    }))
  const bkTopHours   = [...bkHourStats].sort((a, b) => b.winRate - a.winRate).slice(0, 3)
  const bkHotHourSet = new Set(bkTopHours.map(h => h.hour))
  const bkHourNow    = toHourLabel(nyH)
  const bkInBestHour = bkHotHourSet.has(bkHourNow)

  const bkMaeBuckets = [
    { label: '< $100',    min: 0,   max: 100,  emoji: '🟢' },
    { label: '$100–$249', min: 100, max: 250,  emoji: '🟢' },
    { label: '$250–$499', min: 250, max: 500,  emoji: '🟡' },
    { label: '$500+',     min: 500, max: null, emoji: '🔴' },
  ].map(b => {
    const inB  = bkDay_sessions.filter(s => { const mae = Math.abs(s.baja ?? 0); return mae >= b.min && (b.max === null || mae < b.max) })
    const wins = inB.filter(s => (s.cierre ?? 0) >= 0)
    const tot  = inB.reduce((a, s) => a + (s.cierre ?? 0), 0)
    return { ...b, trades: inB.length, winRate: inB.length > 0 ? Math.round(wins.length / inB.length * 100) : 0, avgPnl: inB.length > 0 ? Math.round(tot / inB.length) : 0 }
  })

  const bkMaeUsd  = parseFloat(maeInput)
  const bkMaeVal  = isNaN(bkMaeUsd) || bkMaeUsd < 0 ? null : bkMaeUsd
  const bkSignal  = getBKSignal(bkInBestHour, bkMaeVal)
  const bkSS      = BK_SIG[bkSignal]
  const bkMatched = bkMaeVal !== null ? bkMaeBuckets.find(b => bkMaeVal >= b.min && (b.max === null || bkMaeVal < b.max)) ?? null : null

  const bkWins    = bkDay_sessions.filter(s => (s.cierre ?? 0) >= 0).length
  const bkWinRate = bkDay_sessions.length > 0 ? Math.round(bkWins / bkDay_sessions.length * 100) : 0
  const bkAvgPnl  = bkDay_sessions.length > 0 ? Math.round(bkDay_sessions.reduce((a, s) => a + (s.cierre ?? 0), 0) / bkDay_sessions.length) : 0

  const resetLog = () => { setLogSaved(false); setPendingLogId(null); setLogOutcome('') }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚡ En Vivo</h1>
          <p className="text-xs text-zinc-500 capitalize">{dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-black text-zinc-100">{timeStr}</p>
          <div className="flex gap-1.5 justify-end mt-0.5">
            {seActive && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold">SE activo</span>}
            {bkActive && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-semibold">BK activo</span>}
            {!seActive && !bkActive && <span className="text-xs text-zinc-600">Sin sesión</span>}
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div className="grid grid-cols-3 gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5">
        {[
          { key: 'auto', label: '🤖 Auto', sub: bkActive ? 'BK' : seActive ? 'SE' : '—' },
          { key: 'se',   label: '🌙 SE',   sub: 'Session Edge' },
          { key: 'bk',   label: '⚡ BK',   sub: 'Breakout v4' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as 'auto'|'se'|'bk'); resetLog() }}
            className={`py-2 rounded-xl font-bold text-sm transition-all ${
              (tab === t.key)
                ? t.key === 'bk' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                  : t.key === 'se' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-zinc-700 text-zinc-200 border border-zinc-600'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
            <span className="block text-xs font-normal opacity-60">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* ══ SESSION EDGE ══════════════════════════════════════════════════════ */}
      {activeTab === 'se' && (() => {
        const isSunday  = now.getDay() === 0
        const hour      = now.getHours()
        const minutes   = now.getMinutes()

        // Pre-market domingo
        if (seDay === 'Dom' && isSunday && hour < 18) {
          const minsLeft = (18 - hour - 1) * 60 + (60 - minutes)
          const hLeft    = Math.floor(minsLeft / 60)
          const mLeft    = minsLeft % 60
          return (
            <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
              <p className="text-5xl">⏳</p>
              <div>
                <p className="text-xl font-black text-zinc-200">Aún no es hora</p>
                <p className="text-zinc-500 text-sm mt-1">Mercado abre a las 6:00 PM</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-5">
                <p className="text-4xl font-mono font-black text-emerald-400">
                  {hLeft}h {String(mLeft).padStart(2, '0')}m
                </p>
              </div>
            </div>
          )
        }

        const isDom = seDay === 'Dom'
        return (
          <>
            {/* Day selector SE */}
            <div className="grid grid-cols-2 gap-3">
              {SE_DAYS.map(d => {
                const s  = seSessions.filter(x => normDay(x.dia) === d.key)
                const w  = s.filter(x => (x.cierre ?? 0) >= 0).length
                const wr = s.length > 0 ? Math.round(w / s.length * 100) : 0
                const active = seDay === d.key
                return (
                  <button key={d.key} onClick={() => { setSeDay(d.key); setPullback('') }}
                    className={`py-4 rounded-2xl font-bold text-base transition-all border-2 ${
                      active
                        ? d.key === 'Dom' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
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

            {/* Ventana de hora SE */}
            <div className={`rounded-2xl border p-4 ${seInWindow ? 'bg-emerald-500/8 border-emerald-500/60' : 'bg-zinc-900 border-zinc-800'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-base font-bold ${seInWindow ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {seInWindow ? '🎯 ESTÁS EN VENTANA' : `⏳ Fuera de ventana${seNextWin ? ` · próxima: ${seNextWin.hour}` : ''}`}
                  </p>
                  {seHourLowNow
                    ? <p className="text-xs text-zinc-500 mt-1">Low aquí el <span className="font-semibold text-zinc-300">{seHourLowNow.pct}%</span> de las veces{seHourHiNow ? ` · high el ${seHourHiNow.pct}%` : ''}</p>
                    : <p className="text-xs text-zinc-600 mt-1">Esta hora no es frecuente para el low{seNextWin ? ` · espera hasta ${seNextWin.hour}` : ''}</p>
                  }
                </div>
                <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded-lg text-zinc-400 shrink-0">{seHourNow}</span>
              </div>
              <div className="mt-3 space-y-2">
                {seTopLow.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-600 w-16 shrink-0">📉 Low:</span>
                    {seTopLow.map(h => (
                      <span key={h.hour} className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${h.hour === seHourNow ? isDom ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                        {h.hour} <span className="opacity-60">({h.pct}%)</span>
                      </span>
                    ))}
                  </div>
                )}
                {seTopHigh.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-600 w-16 shrink-0">📈 High:</span>
                    {seTopHigh.map(h => (
                      <span key={h.hour} className={`px-2.5 py-1 rounded-lg text-xs font-mono ${h.hour === seHourNow ? 'bg-zinc-600 text-white' : 'bg-zinc-800/60 text-zinc-400'}`}>
                        {h.hour} <span className="opacity-60">({h.pct}%)</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Input pullback SE */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto ha bajado desde el open?</p>
              <p className="text-xs text-zinc-500 mb-4">Puntos NQ de retroceso desde apertura</p>
              <input
                type="number" inputMode="decimal" min={0} placeholder="0" value={pullback}
                onChange={e => setPullback(e.target.value)}
                className={`bg-zinc-800 border-2 rounded-xl px-4 py-4 text-4xl font-mono font-black text-center text-zinc-100 w-full focus:outline-none transition-colors ${
                  pullback ? isDom ? 'border-emerald-500' : 'border-blue-500' : 'border-zinc-700 focus:border-zinc-500'
                }`}
              />
              {pullback && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-zinc-500">Bucket: <span className="font-mono text-zinc-300">{seMatched?.label ?? '—'}</span>{seMatched ? ` · ${seMatched.trades} trades` : ''}</p>
                  <button onClick={() => setPullback('')} className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800">✕</button>
                </div>
              )}
            </div>

            {/* Semáforo SE */}
            <div className={`rounded-2xl border-2 p-7 text-center ${seSS.bg} ${seSS.border}`}>
              <p className={`text-5xl font-black tracking-tight ${seSS.text}`}>{seSS.label}</p>
              <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{seSS.sub}</p>
              <div className="flex justify-center gap-5 mt-5 text-xs text-zinc-500">
                <span className="flex flex-col items-center gap-1"><span className="text-base">{seMatched ? `${seMatched.winRate}%` : '—'}</span><span>pullback</span></span>
                <span className="text-zinc-700">|</span>
                <span className="flex flex-col items-center gap-1"><span className="text-base">{seInWindow ? '✓' : '✗'}</span><span>ventana</span></span>
                <span className="text-zinc-700">|</span>
                <span className="flex flex-col items-center gap-1"><span className="text-base">{seHistAvg !== null ? `${seHistAvg >= 0 ? '+' : ''}${seHistAvg}` : '—'}</span><span>mes hist.</span></span>
              </div>
            </div>

            {/* Tabla pullback SE */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs font-semibold text-zinc-400 mb-3">Pullback → Probabilidad · {isDom ? 'Domingos' : 'Martes'}</p>
              <div className="space-y-2.5">
                {seBuckets.map(b => {
                  const active = seMatched?.label === b.label
                  return (
                    <div key={b.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? isDom ? 'bg-zinc-700 ring-2 ring-emerald-500' : 'bg-zinc-700 ring-2 ring-blue-500' : ''}`}>
                      <span className="text-xs font-mono text-zinc-400 w-20 shrink-0">{b.label}</span>
                      <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${b.winRate}%` }} />
                      </div>
                      <span className={`text-sm font-black w-10 text-right shrink-0 ${b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{b.winRate}%</span>
                      <span className={`text-xs w-14 text-right font-mono shrink-0 ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.avgPnl >= 0 ? '+' : ''}{b.avgPnl}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Stats SE */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-xs text-zinc-500 mb-2">📅 Este mes hist.</p>
                {seHistAvg !== null ? (
                  <><p className={`text-3xl font-black ${seHistAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{seHistAvg >= 0 ? '+' : ''}{seHistAvg}</p>
                  <p className="text-xs text-zinc-500 mt-1">avg · {seHistMonth.length} años</p>
                  {seThisMonth && <p className="text-xs text-zinc-400 mt-2">{now.getFullYear()}: {seThisMonth.winRate}% · {seThisMonth.trades}t</p>}</>
                ) : <p className="text-zinc-600 text-sm mt-2">Sin historial</p>}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-xs text-zinc-500 mb-2">📊 Base total</p>
                <p className={`text-3xl font-black ${isDom ? 'text-emerald-400' : 'text-blue-400'}`}>{seWinRate}%</p>
                <p className="text-xs text-zinc-500 mt-1">win rate</p>
                <p className={`text-sm font-bold mt-2 ${seAvgPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{seAvgPts >= 0 ? '+' : ''}{seAvgPts} avg</p>
                <p className="text-xs text-zinc-500">{seDay_sessions.length} sesiones</p>
              </div>
            </div>
          </>
        )
      })()}

      {/* ══ BREAKOUT V4 ═══════════════════════════════════════════════════════ */}
      {activeTab === 'bk' && (
        <>
          {/* Day selector BK */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {BK_DAYS.map(d => {
              const s  = bkSessions.filter(x => normDay(x.dia) === d.key)
              const w  = s.filter(x => (x.cierre ?? 0) >= 0).length
              const wr = s.length > 0 ? Math.round(w / s.length * 100) : 0
              const active = bkDay === d.key
              return (
                <button key={d.key} onClick={() => { setBkDay(d.key); setMaeInput('') }}
                  className={`flex-1 min-w-[60px] py-3 rounded-2xl font-bold text-sm transition-all border-2 shrink-0 ${
                    active ? 'bg-blue-500/15 border-blue-500 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500 active:bg-zinc-800'
                  }`}
                >
                  {d.label}
                  <span className={`block text-xs font-normal mt-0.5 ${active ? 'opacity-80' : 'opacity-50'}`}>{wr}% · {s.length}t</span>
                </button>
              )
            })}
          </div>

          {/* Ventana hora BK */}
          <div className={`rounded-2xl border p-4 ${bkInBestHour ? 'bg-blue-500/8 border-blue-500/60' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-base font-bold ${bkInBestHour ? 'text-blue-400' : 'text-zinc-300'}`}>
                  {bkInBestHour ? '🎯 EN VENTANA ÓPTIMA' : `⏳ Fuera de ventana${bkTopHours.length > 0 ? ` · mejor: ${bkTopHours[0].hour}` : ''}`}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {bkInBestHour
                    ? `${bkHourNow} está entre las mejores horas de entrada para ${bkDay}`
                    : `Mejores horas: ${bkTopHours.map(h => `${h.hour} (${h.winRate}%)`).join(', ')}`}
                </p>
              </div>
              <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded-lg text-zinc-400 shrink-0">{bkHourNow}</span>
            </div>
            {bkHourStats.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {bkHourStats.map(h => (
                  <span key={h.hour} className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                    h.hour === bkHourNow ? 'bg-blue-500 text-white'
                    : bkHotHourSet.has(h.hour) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {h.hour} <span className="opacity-70">{h.winRate}%</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Input MAE BK */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-sm font-semibold text-zinc-300 mb-1">¿Cuánto va en tu contra el trade?</p>
            <p className="text-xs text-zinc-500 mb-4">USD adverso activo · $500+ zona de colapso</p>
            <div className="flex items-center gap-3">
              <span className="text-2xl text-zinc-500 font-mono shrink-0">$</span>
              <input
                type="number" inputMode="decimal" min={0} placeholder="0" value={maeInput}
                onChange={e => setMaeInput(e.target.value)}
                className={`bg-zinc-800 border-2 rounded-xl px-4 py-4 text-4xl font-mono font-black text-center text-zinc-100 w-full focus:outline-none transition-colors ${
                  bkMaeVal === null ? 'border-zinc-700 focus:border-zinc-500'
                  : bkMaeVal >= 500 ? 'border-red-500' : bkMaeVal >= 250 ? 'border-amber-500' : 'border-blue-500'
                }`}
              />
            </div>
            {maeInput && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-zinc-500">{bkMatched ? `${bkMatched.emoji} ${bkMatched.label} · ${bkMatched.winRate}% win · ${bkMatched.trades}t` : '—'}</p>
                <button onClick={() => setMaeInput('')} className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800">✕</button>
              </div>
            )}
          </div>

          {/* Semáforo BK */}
          <div className={`rounded-2xl border-2 p-7 text-center ${bkSS.bg} ${bkSS.border}`}>
            <p className={`text-5xl font-black tracking-tight ${bkSS.text}`}>{bkSS.label}</p>
            <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{bkSS.sub}</p>
            <div className="flex justify-center gap-5 mt-5 text-xs text-zinc-500">
              <span className="flex flex-col items-center gap-1"><span className="text-base">{bkInBestHour ? '✓' : '✗'}</span><span>ventana</span></span>
              <span className="text-zinc-700">|</span>
              <span className="flex flex-col items-center gap-1"><span className={`text-base font-bold ${bkMaeVal === null ? '' : bkMaeVal >= 500 ? 'text-red-400' : bkMaeVal >= 250 ? 'text-amber-400' : 'text-blue-400'}`}>{bkMaeVal !== null ? `$${bkMaeVal}` : '—'}</span><span>MAE USD</span></span>
              <span className="text-zinc-700">|</span>
              <span className="flex flex-col items-center gap-1"><span className="text-base">{bkWinRate}%</span><span>{bkDay} hist.</span></span>
            </div>
          </div>

          {/* Tabla MAE BK */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-3">MAE USD → Probabilidad · {bkDay}</p>
            <div className="space-y-2.5">
              {bkMaeBuckets.map(b => {
                const active = bkMatched?.label === b.label
                return (
                  <div key={b.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? 'bg-zinc-700 ring-2 ring-blue-500' : ''} ${b.label === '$500+' ? 'border border-red-500/20' : ''}`}>
                    <span className="text-xs font-mono text-zinc-400 w-20 shrink-0">{b.label}</span>
                    <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${b.winRate}%` }} />
                    </div>
                    <span className={`text-sm font-black w-10 text-right shrink-0 ${b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{b.winRate}%</span>
                    <span className={`text-xs w-16 text-right font-mono shrink-0 ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.avgPnl >= 0 ? '+$' : '-$'}{Math.abs(b.avgPnl)}</span>
                    <span className="text-xs text-zinc-600 w-10 text-right shrink-0">{b.trades}t</span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-zinc-600 mt-3">$500 ≈ 25 pts adversos con 10 MNQ · SL en 50 pts</p>
          </div>

          {/* Stats BK */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 mb-2">📊 {bkDay} total</p>
              <p className="text-3xl font-black text-blue-400">{bkWinRate}%</p>
              <p className="text-xs text-zinc-500 mt-1">win rate · {bkDay_sessions.length} trades</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 mb-2">💰 P&L promedio</p>
              <p className={`text-3xl font-black ${bkAvgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{bkAvgPnl >= 0 ? '+$' : '-$'}{Math.abs(bkAvgPnl)}</p>
              <p className="text-xs text-zinc-500 mt-1">USD por trade</p>
            </div>
          </div>
        </>
      )}

      {/* ══ LOG — compartido ═══════════════════════════════════════════════════ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-zinc-300">📝 Registrar señal</p>
        {!pendingLogId && !logSaved && (
          <>
            <p className="text-xs text-zinc-500">¿Entraste al trade?</p>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: '✅ Sí, entré', entro: true }, { label: '❌ No entré', entro: false }].map(opt => (
                <button key={String(opt.entro)}
                  onClick={async () => {
                    setSavingLog(true)
                    const fechaHoy = now.toISOString().slice(0, 10)
                    const isBS = activeTab === 'bk'
                    const res = await fetch('/api/signals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        dia: isBS ? bkDay : seDay,
                        fecha: fechaHoy,
                        hora: toHourLabel(nyH),
                        pullback_pts: isBS ? (bkMaeVal ?? 0) : (isNaN(sePts) ? 0 : sePts),
                        signal: isBS ? bkSignal : seSignal,
                        en_ventana: isBS ? bkInBestHour : seInWindow,
                        entro: opt.entro,
                      }),
                    })
                    const d = await res.json()
                    if (opt.entro) setPendingLogId(d.id)
                    else setLogSaved(true)
                    setSavingLog(false)
                  }}
                  disabled={savingLog}
                  className={`py-3 rounded-xl font-bold text-sm ${
                    opt.entro
                      ? activeTab === 'bk' ? 'bg-blue-500/15 border border-blue-500/50 text-blue-400' : 'bg-emerald-500/15 border border-emerald-500/50 text-emerald-400'
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
        {pendingLogId && !logSaved && (
          <>
            <p className="text-xs text-zinc-500">Resultado del trade (llena después)</p>
            <div className="flex gap-3">
              <input type="number" inputMode="decimal" placeholder="+500 o -100" value={logOutcome}
                onChange={e => setLogOutcome(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-mono font-bold text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
              <button onClick={async () => {
                if (!logOutcome) return
                setSavingLog(true)
                await fetch('/api/signals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pendingLogId, outcome_pts: parseFloat(logOutcome) }) })
                setLogSaved(true); setPendingLogId(null); setSavingLog(false)
              }} disabled={savingLog || !logOutcome}
                className="px-4 py-3 rounded-xl bg-zinc-600 text-white font-bold text-sm disabled:opacity-40">
                Guardar
              </button>
            </div>
            <button onClick={() => setLogSaved(true)} className="text-xs text-zinc-600 hover:text-zinc-400">Llenar después →</button>
          </>
        )}
        {logSaved && (
          <div className="text-center py-2">
            <p className="text-zinc-300 font-semibold">✓ Señal registrada</p>
            <button onClick={resetLog} className="text-xs text-zinc-600 hover:text-zinc-400 mt-1">Registrar otra</button>
          </div>
        )}
      </div>

      {/* Historial */}
      {signalLogs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-3">🗂 Últimas señales</p>
          <div className="space-y-2">
            {signalLogs.slice(0, 8).map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-zinc-500 font-mono w-20 shrink-0">{l.fecha}</span>
                <span className={`shrink-0 ${l.signal === 'GO' ? 'text-emerald-400' : l.signal === 'GO_OOW' ? 'text-amber-400' : l.signal === 'DANGER' ? 'text-red-400' : 'text-zinc-500'}`}>
                  {l.signal === 'GO' ? '🟢' : l.signal === 'GO_OOW' ? '🟢⚠️' : l.signal === 'DANGER' ? '🔴' : '🟡'}
                </span>
                <span className="text-zinc-400 shrink-0">{l.dia}</span>
                <span className="text-zinc-600 shrink-0">{l.entro ? 'Entró' : 'No entró'}</span>
                {l.outcome_pts !== null && (
                  <span className={`font-mono font-bold ml-auto shrink-0 ${l.outcome_pts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {l.outcome_pts >= 0 ? '+' : ''}{l.outcome_pts}
                  </span>
                )}
                {l.outcome_pts === null && l.entro && <span className="text-zinc-600 ml-auto">pendiente</span>}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
