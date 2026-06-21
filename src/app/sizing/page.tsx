'use client'

import { useEffect, useState } from 'react'
import { Session } from '@/lib/types'
import { calcPullbackDepthBuckets } from '@/lib/calc'

// ── Datos BK (hardcoded del backtest 1,793 trades) ───────────────────────────
const PAUSE_SLOTS: Record<string, number[]> = {
  Lun: [14, 18, 19],
  Mar: [],
  Mié: [16],
  Jue: [12, 15],
  Vie: [11],
}

const EV_MATRIX: Record<string, Record<number, { n: number; avg: number }>> = {
  Lun: { 9:{n:46,avg:1516}, 10:{n:17,avg:1362}, 11:{n:19,avg:1320}, 12:{n:20,avg:1135}, 13:{n:23,avg:1157}, 15:{n:20,avg:1702}, 16:{n:9,avg:980} },
  Mar: { 9:{n:37,avg:1569}, 10:{n:31,avg:1431}, 11:{n:16,avg:1614}, 12:{n:17,avg:1473}, 13:{n:15,avg:1212}, 14:{n:19,avg:970}, 15:{n:27,avg:1144}, 16:{n:13,avg:1176}, 18:{n:7,avg:1507}, 19:{n:11,avg:1187} },
  Mié: { 9:{n:36,avg:1560}, 10:{n:23,avg:1449}, 11:{n:16,avg:993}, 12:{n:11,avg:1277}, 13:{n:16,avg:3213}, 14:{n:29,avg:1997}, 15:{n:20,avg:1173}, 18:{n:10,avg:1381}, 19:{n:6,avg:996} },
  Jue: { 9:{n:33,avg:1511}, 10:{n:20,avg:1295}, 11:{n:20,avg:1149}, 13:{n:27,avg:1573}, 14:{n:16,avg:1270}, 16:{n:7,avg:1740}, 18:{n:12,avg:1157}, 19:{n:6,avg:857} },
  Vie: { 9:{n:33,avg:1761}, 10:{n:26,avg:1284}, 12:{n:15,avg:1159}, 13:{n:16,avg:938}, 14:{n:12,avg:1128}, 15:{n:20,avg:1715} },
}

const WR_MATRIX: Record<string, Record<number, number>> = {
  Lun: { 9:57, 10:46, 11:63, 12:71, 13:70, 14:44, 15:54, 16:90, 18:39, 19:46 },
  Mar: { 9:55, 10:64, 11:59, 12:72, 13:60, 14:71, 15:74, 16:59, 18:70, 19:79 },
  Mié: { 9:54, 10:60, 11:57, 12:61, 13:59, 14:60, 15:61, 16:68, 18:59, 19:60 },
  Jue: { 9:52, 10:49, 11:57, 12:38, 13:75, 14:70, 15:47, 16:54, 18:75, 19:55 },
  Vie: { 9:56, 10:60, 11:44, 12:60, 13:73, 14:57, 15:58, 16:50 },
}

// ── Reglas de sizing (números reales acordados) ───────────────────────────────
//
// BK Breakout v4:
//   Días normales    → 5 MNQ  (riesgo $500 por SL 50pts)
//   Martes           → 10 MNQ (día limpio, doble tamaño)
//   Martes slot top  → 15 MNQ (Martes + WR≥65% + EV≥$1,500)
//   Slot negativo    → 0 MNQ  (pausar automación)
//
// SE Session Edge:
//   Base / Martes    → 1 MNQ  (siempre fue así)
//   Dom pullback ok  → 2 MNQ  (50-100pts, WR moderado)
//   Dom pullback top → 3 MNQ  (100-150pts, sweet spot)
//   Dom pullback max → 4 MNQ  (solo si WR>70% Y en ventana de hora)
//   Pullback >150pts → 0 MNQ  (probabilidad se invierte)

const BK_BASE    = 5
const BK_MAR     = 10
const BK_MAR_TOP = 15
const SE_BASE    = 1
const SE_DOM_OK  = 2
const SE_DOM_TOP = 3
const SE_DOM_MAX = 4

function getBKSize(day: string, hour: number): { size: number; label: string; reason: string } {
  const isPause = (PAUSE_SLOTS[day] ?? []).includes(hour)
  if (isPause) return { size: 0, label: '0 MNQ', reason: `${day} ${hour}h = slot negativo histórico — PAUSAR automación` }
  if (day === 'Mar') {
    const ev = EV_MATRIX['Mar']?.[hour]
    const wr = WR_MATRIX['Mar']?.[hour]
    if (ev && wr && ev.avg >= 1500 && wr >= 65)
      return { size: BK_MAR_TOP, label: `${BK_MAR_TOP} MNQ`, reason: `Mar ${hour}h WR ${wr}% + EV $${ev.avg.toLocaleString()} — slot top de Martes` }
    return { size: BK_MAR, label: `${BK_MAR} MNQ`, reason: 'Martes = único día sin hora mala en 7 años — tamaño doble' }
  }
  return { size: BK_BASE, label: `${BK_BASE} MNQ`, reason: `${day} ${hour}h = slot válido, tamaño base` }
}

function getSESize(pullbackPts: number, day: string): { size: number; label: string; reason: string; action: string } {
  if (pullbackPts === 0) return { size: 0, label: '—', reason: 'Introduce el pullback para calcular', action: 'ESPERAR' }
  if (pullbackPts < 50) return { size: SE_BASE, label: `${SE_BASE} MNQ`, reason: 'Pullback pequeño — setup débil, mínimo tamaño', action: 'ESPERAR' }
  if (pullbackPts > 150) return { size: 0, label: '0 MNQ', reason: 'Más de 150pts = probabilidad se INVIERTE históricamente', action: 'NO ENTRAR' }
  if (day === 'Mar') return { size: SE_BASE, label: `${SE_BASE} MNQ`, reason: 'Martes SE — tamaño base siempre', action: 'GO' }
  // Domingos: escalar por pullback
  if (pullbackPts >= 100) return { size: SE_DOM_TOP, label: `${SE_DOM_TOP} MNQ`, reason: 'Dom 100-150pts = sweet spot histórico — tamaño premium', action: 'GO TOP' }
  return { size: SE_DOM_OK, label: `${SE_DOM_OK} MNQ`, reason: 'Dom 50-100pts — pullback válido, tamaño moderado', action: 'GO' }
}

// ── Helpers de tiempo ─────────────────────────────────────────────────────────
function getNYTime(now: Date) {
  const str = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
  const [, timePart] = str.split(', ')
  const parts = timePart.split(':').map(Number)
  const h = parts[0] === 24 ? 0 : parts[0]
  const m = parts[1]
  const dowStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
  const dayMap: Record<string, string> = { Sun:'Dom', Mon:'Lun', Tue:'Mar', Wed:'Mié', Thu:'Jue', Fri:'Vie', Sat:'Sáb' }
  return { h, m, totalMin: h * 60 + m, dayNY: dayMap[dowStr] ?? dowStr, isWeekend: dowStr === 'Sat' || dowStr === 'Sun' }
}

function toHourLabel(h: number) {
  return h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
}

function normDay(d: string) {
  const map: Record<string, string> = {
    'Sun':'Dom','Mon':'Lun','Tue':'Mar','Wed':'Mié','Thu':'Jue','Fri':'Vie','Sat':'Sáb',
    'Domingo':'Dom','Martes':'Mar',
  }
  return map[d] ?? d
}

const SESSION_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 18, 19]
const BK_SESSION_START = 8 * 60
const BK_SESSION_END   = 20 * 60
const SE_OPEN_MIN  = 18 * 60
const SE_CLOSE_MIN = 16 * 60 + 15

function isSEActive(totalMin: number, dow: number): boolean {
  const a = totalMin >= SE_OPEN_MIN, b = totalMin < SE_CLOSE_MIN
  if (dow === 0) return a
  if (dow === 1 || dow === 2) return a || b
  if (dow === 3) return b
  return false
}

const DAYS_BK = ['Lun','Mar','Mié','Jue','Vie'] as const

// ── Componente ────────────────────────────────────────────────────────────────
export default function SizingPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading]   = useState(true)
  const [now, setNow]           = useState(new Date())
  const [pullback, setPullback] = useState('')
  const [seDay, setSeDay]       = useState<'Dom'|'Mar'>(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('se_activeDay')
      if (s === 'Dom' || s === 'Mar') return s
    }
    return 'Dom'
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch('/api/sessions?strategy=session_edge')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSessions(data); setLoading(false) })
  }, [])

  const { h: nyH, m: nyM, totalMin: nyMin, dayNY, isWeekend } = getNYTime(now)
  const timeStr = `${String(nyH).padStart(2,'0')}:${String(nyM).padStart(2,'0')} NY`

  const bkActive  = !isWeekend && nyMin >= BK_SESSION_START && nyMin < BK_SESSION_END
  const nyDow     = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay()
  const seActive  = isSEActive(nyMin, nyDow)

  const bkRec  = bkActive ? getBKSize(dayNY, nyH) : null
  const pts    = parseFloat(pullback)
  const seRec  = getSESize(isNaN(pts) ? 0 : pts, seDay)

  // Pullback buckets para referencia
  const bucketsDom = calcPullbackDepthBuckets(sessions, 'Dom')
  const bucketsMar = calcPullbackDepthBuckets(sessions, 'Mar')

  // Sizing color helpers
  const sizeColor = (n: number) =>
    n === 0         ? 'text-red-400'     :
    n >= BK_MAR_TOP ? 'text-yellow-300'  :
    n >= BK_MAR     ? 'text-emerald-300' :
    n >= SE_DOM_TOP ? 'text-emerald-300' :
    'text-zinc-200'

  const sizeBg = (n: number) =>
    n === 0         ? 'bg-red-500/10    border-red-500'     :
    n >= BK_MAR_TOP ? 'bg-yellow-400/10 border-yellow-400'  :
    n >= BK_MAR     ? 'bg-emerald-500/10 border-emerald-400':
    n >= SE_DOM_TOP ? 'bg-emerald-500/10 border-emerald-400':
    'bg-zinc-800 border-zinc-600'

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold leading-tight">⚖️ Sizing · Riesgo</h1>
          <p className="text-xs text-zinc-500">Cuántos contratos y cuándo estar tranquilo</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-mono font-black text-emerald-400">{timeStr}</p>
          <p className="text-xs text-zinc-500 capitalize">{dayNY}</p>
        </div>
      </div>

      {/* ── AHORA — resumen ejecutivo ─────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ahora mismo</p>

        {/* BK */}
        <div className={`rounded-xl border p-4 ${bkRec ? sizeBg(bkRec.size) : 'bg-zinc-800 border-zinc-700'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">⚡ BK Breakout v4</p>
              {bkActive && bkRec ? (
                <>
                  <p className={`text-3xl font-black ${sizeColor(bkRec.size)}`}>{bkRec.label}</p>
                  <p className="text-xs text-zinc-400 mt-1">{bkRec.reason}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-zinc-600">Sin sesión</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {isWeekend ? 'Fin de semana — BK no opera'
                    : nyMin < BK_SESSION_START ? `Abre a las 8AM NY (en ${Math.round((BK_SESSION_START - nyMin))}min)`
                    : 'Sesión cerrada'}
                  </p>
                </>
              )}
            </div>
            {bkActive && bkRec && (
              <div className="text-right shrink-0 ml-4">
                <p className="text-xs text-zinc-500">{dayNY} {toHourLabel(nyH)}</p>
                {bkRec.size > 0 ? (
                  <>
                    <p className="text-xs text-zinc-400 mt-1">WR {WR_MATRIX[dayNY]?.[nyH] ?? '—'}%</p>
                    <p className="text-xs text-zinc-400">EV ${(EV_MATRIX[dayNY]?.[nyH]?.avg ?? 0).toLocaleString()}</p>
                  </>
                ) : (
                  <p className="text-lg font-black text-red-400 mt-1">PAUSAR</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SE */}
        <div className={`rounded-xl border p-4 ${seRec.size > 0 ? sizeBg(seRec.size) : seRec.action === 'NO ENTRAR' ? 'bg-red-500/10 border-red-500' : 'bg-zinc-800 border-zinc-700'}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs text-zinc-500 mb-0.5">⚡ SE Session Edge</p>
              {seActive ? (
                <>
                  <p className={`text-3xl font-black ${seRec.size > 0 ? sizeColor(seRec.size) : seRec.action === 'NO ENTRAR' ? 'text-red-400' : 'text-zinc-500'}`}>
                    {seRec.label || (seRec.action === 'ESPERAR' && !pullback ? 'introduce pullback' : '—')}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">{seRec.reason}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-zinc-600">Sin sesión</p>
                  <p className="text-xs text-zinc-600 mt-1">SE opera Dom–Mar 6PM → 4:15PM NY</p>
                </>
              )}
            </div>
            {seActive && (
              <div className="text-right shrink-0 ml-4">
                <p className={`text-sm font-black ${seRec.action === 'GO' || seRec.action === 'GO +50%' ? 'text-emerald-400' : seRec.action === 'NO ENTRAR' ? 'text-red-400' : 'text-zinc-500'}`}>
                  {seRec.action}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pullback input SE ─────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-zinc-300">SE · Pullback desde el open</p>
          <div className="flex gap-2">
            {(['Dom','Mar'] as const).map(d => (
              <button key={d}
                onClick={() => { setSeDay(d); localStorage.setItem('se_activeDay', d) }}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                  seDay === d
                    ? d === 'Dom' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400' : 'bg-blue-500/15 border-blue-500 text-blue-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                }`}
              >{d}</button>
            ))}
          </div>
        </div>
        <input
          type="number" inputMode="decimal" min={0} placeholder="0"
          value={pullback}
          onChange={e => setPullback(e.target.value)}
          className={`bg-zinc-800 border-2 rounded-xl px-4 py-3 text-3xl font-mono font-black text-center text-zinc-100 w-full focus:outline-none transition-colors ${
            pullback ? (seDay === 'Dom' ? 'border-emerald-500' : 'border-blue-500') : 'border-zinc-700 focus:border-zinc-500'
          }`}
        />
        {pullback && (
          <div className="mt-3 flex items-center justify-between">
            <p className={`text-sm font-bold ${
              pts > 150 ? 'text-red-400' : pts >= 50 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {pts > 150 ? '⛔ NO ENTRAR — probabilidad invertida'
              : pts >= 100 && seDay === 'Dom' ? `✅ ${SE_DOM_TOP} MNQ — pullback fuerte Dom`
              : pts >= 50 && seDay === 'Dom' ? `✅ ${SE_DOM_OK} MNQ — pullback válido Dom`
              : pts >= 50 ? `✅ ${SE_BASE} MNQ — Martes base`
              : '⏳ Muy pequeño — esperar más retroceso'}
            </p>
            <button onClick={() => setPullback('')} className="text-xs text-zinc-600 hover:text-zinc-400">✕</button>
          </div>
        )}
      </div>

      {/* ── Tabla BK: sizing por día y hora ──────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Reglas BK · Sizing por día</p>
        <div className="space-y-3">
          {DAYS_BK.map(day => {
            const pause = PAUSE_SLOTS[day] ?? []
            const isMar = day === 'Mar'
            const isCurrent = day === dayNY && bkActive
            return (
              <div key={day} className={`rounded-xl p-3 border transition-all ${
                isCurrent ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-800/40'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-black text-sm ${isCurrent ? 'text-emerald-400' : 'text-zinc-300'}`}>{day}</span>
                    {isCurrent && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">HOY</span>}
                  </div>
                  <span className={`text-sm font-black ${isMar ? 'text-yellow-300' : pause.length > 0 ? 'text-zinc-300' : 'text-emerald-400'}`}>
                    {isMar ? `${BK_MAR} MNQ ⭐` : `${BK_BASE} MNQ`}
                  </span>
                </div>
                {isMar ? (
                  <p className="text-xs text-zinc-500">✅ Día limpio — 0 horas malas en 7 años — 2x siempre</p>
                ) : pause.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500">Pausar:</span>
                    {pause.map(h => (
                      <span key={h} className="text-xs bg-red-500/15 border border-red-500/30 text-red-400 px-2 py-0.5 rounded-lg font-mono">
                        {toHourLabel(h)}
                      </span>
                    ))}
                    <span className="text-xs text-zinc-600">→ 0 MNQ en esas horas</span>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Sin horas malas — 1x todo el día</p>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3 border-t border-zinc-800 pt-3">
          Base {BK_BASE} MNQ → riesgo $500 · Mar {BK_MAR} MNQ → $1,000 · Mar top {BK_MAR_TOP} MNQ → $1,500 por trade (SL 50pts)
        </p>
      </div>

      {/* ── Tabla SE: sizing por pullback ─────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Reglas SE · Sizing por pullback</p>
        
        {/* Dom */}
        <p className="text-xs text-zinc-500 mb-2">🌟 Domingos</p>
        <div className="space-y-2 mb-4">
          {!loading && bucketsDom.map(b => {
            const isActive = !isNaN(pts) && pts >= b.minPts && (b.maxPts === null || pts < b.maxPts)
            const seSize = getSESize((b.minPts + (b.maxPts ?? b.minPts + 30)) / 2, 'Dom')
            return (
              <div key={b.label} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${
                isActive ? 'bg-zinc-700 ring-2 ring-emerald-500' : ''
              }`}>
                <span className="text-xs font-mono text-zinc-400 w-20 shrink-0">{b.label}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${b.winRate}%` }} />
                </div>
                <span className={`text-xs font-black w-8 text-right ${b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {b.winRate}%
                </span>
                <span className={`text-xs font-black w-16 text-right ${sizeColor(seSize.size)}`}>{seSize.label || '0 MNQ'}</span>
              </div>
            )
          })}
        </div>

        {/* Mar */}
        <p className="text-xs text-zinc-500 mb-2">📈 Martes</p>
        <div className="space-y-2">
          {!loading && bucketsMar.map(b => {
            const isActive = seDay === 'Mar' && !isNaN(pts) && pts >= b.minPts && (b.maxPts === null || pts < b.maxPts)
            const seSize = getSESize((b.minPts + (b.maxPts ?? b.minPts + 30)) / 2, 'Mar')
            return (
              <div key={b.label} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${
                isActive ? 'bg-zinc-700 ring-2 ring-blue-500' : ''
              }`}>
                <span className="text-xs font-mono text-zinc-400 w-20 shrink-0">{b.label}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${b.winRate >= 70 ? 'bg-emerald-500' : b.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${b.winRate}%` }} />
                </div>
                <span className={`text-xs font-black w-8 text-right ${b.winRate >= 70 ? 'text-emerald-400' : b.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {b.winRate}%
                </span>
                <span className={`text-xs font-black w-16 text-right ${sizeColor(seSize.size)}`}>{seSize.label || '0 MNQ'}</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3 border-t border-zinc-800 pt-3">⚠️ &gt;150pts en ambos días = NO ENTRAR</p>
      </div>

      {/* ── Semana de un vistazo ──────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Semana de un vistazo · BK</p>
        <div className="grid grid-cols-5 gap-2">
          {DAYS_BK.map(day => {
            const pause = PAUSE_SLOTS[day] ?? []
            const isMar = day === 'Mar'
            const isCurrent = day === dayNY
            return (
              <div key={day} className={`rounded-xl p-2.5 text-center border-2 ${
                isCurrent ? 'border-emerald-500 bg-emerald-500/10'
                : isMar ? 'border-yellow-400/40 bg-yellow-400/5'
                : 'border-zinc-800 bg-zinc-800/40'
              }`}>
                <p className={`text-xs font-black ${isCurrent ? 'text-emerald-400' : isMar ? 'text-yellow-300' : 'text-zinc-400'}`}>{day}</p>
                <p className={`text-lg font-black mt-1 ${isMar ? 'text-yellow-300' : 'text-zinc-200'}`}>
                  {isMar ? BK_MAR : BK_BASE}
                </p>
                <p className="text-xs text-zinc-600">MNQ</p>
                {pause.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">{pause.length}✗</p>
                )}
                {isMar && <p className="text-xs text-yellow-400 mt-1">⭐</p>}
                {pause.length === 0 && !isMar && <p className="text-xs text-emerald-500 mt-1">✓</p>}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-600">
          <span>⭐ 2x = Martes</span>
          <span>✗ = horas malas (0 MNQ)</span>
          <span>✓ = día limpio</span>
        </div>
      </div>

    </div>
  )
}
