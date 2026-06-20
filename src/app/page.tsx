'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'
import {
  calcKPIs, calcDayStats, calcPeakDistribution,
  calcStreaks, calcMaeMfe, calcHourStats,
  calcWeeklyPnl, calcTodayPnl, calcPullbackSim,
  calcDayProfiles, calcSkipDaySim, calcMonthlyByDay,
  calcYearlyByDay, calcPullbackDepthBuckets, calcTopSessions, calcHourMapByDay,
} from '@/lib/calc'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'

const STRATEGIES = [
  { value: 'session_edge', label: 'NQ Session Edge' },
  { value: 'breakout_v4', label: 'Breakout Long v4' },
  { value: 'open_below_80', label: 'Open Below 80%' },
]

// ─── Calendar Heatmap ─────────────────────────────────────────────────────────
function CalendarHeatmap({ sessions }: { sessions: Session[] }) {
  const pnlByDate: Record<string, number> = {}
  for (const s of sessions) {
    pnlByDate[s.fecha] = (pnlByDate[s.fecha] ?? 0) + (s.cierre ?? 0)
  }
  const today = new Date()
  const days: { date: string; pnl: number | null }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, pnl: pnlByDate[key] ?? null })
  }
  const firstDay = new Date(days[0].date).getDay()
  const padded = Array(firstDay).fill(null).concat(days)
  const weeks: (typeof days[0] | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

  const cellColor = (pnl: number | null) => {
    if (pnl === null) return 'bg-zinc-800'
    if (pnl > 500) return 'bg-emerald-500'
    if (pnl > 0) return 'bg-emerald-800'
    if (pnl < -500) return 'bg-red-500'
    return 'bg-red-800'
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => (
              <div key={di}
                title={day ? `${day.date}: ${day.pnl !== null ? (day.pnl >= 0 ? '+' : '') + Math.round(day.pnl) : 'sin trade'}` : ''}
                className={`w-3 h-3 rounded-sm ${day ? cellColor(day.pnl) : 'bg-transparent'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-800 inline-block" /> Sin trade</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-800 inline-block" /> Win</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Win &gt;500</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-800 inline-block" /> Loss</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> Loss &gt;-500</span>
      </div>
    </div>
  )
}

// ─── Meta Semanal ─────────────────────────────────────────────────────────────
function GoalTracker({ sessions }: { sessions: Session[] }) {
  const [weeklyGoal, setWeeklyGoal] = useState(2000)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('2000')

  const weeklyPnl = calcWeeklyPnl(sessions)
  const todayPnl = calcTodayPnl(sessions)
  const pct = Math.min(Math.max((weeklyPnl / weeklyGoal) * 100, 0), 100)
  const isNeg = weeklyPnl < 0
  const isGoalMet = weeklyPnl >= weeklyGoal

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Meta Semanal</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-2xl font-bold ${isNeg ? 'text-red-400' : isGoalMet ? 'text-emerald-400' : 'text-white'}`}>
                {weeklyPnl >= 0 ? '+' : ''}{Math.round(weeklyPnl).toLocaleString()}
              </span>
              <span className="text-zinc-500 text-sm">/ ${weeklyGoal.toLocaleString()}</span>
              {isGoalMet && <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-full">✓ Meta alcanzada</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Hoy</p>
            <p className={`text-lg font-bold ${todayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {todayPnl >= 0 ? '+' : ''}{Math.round(todayPnl).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isGoalMet ? 'bg-emerald-500' : isNeg ? 'bg-red-500' : 'bg-emerald-700'}`}
            style={{ width: `${isNeg ? 0 : pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-zinc-600">{Math.round(pct)}%</span>
          {editing ? (
            <form onSubmit={e => { e.preventDefault(); setWeeklyGoal(parseInt(input) || 2000); setEditing(false) }} className="flex gap-1">
              <input type="number" value={input} onChange={e => setInput(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 text-xs w-24 text-zinc-200" autoFocus />
              <button type="submit" className="text-xs text-emerald-400">OK</button>
            </form>
          ) : (
            <button onClick={() => { setInput(String(weeklyGoal)); setEditing(true) }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition">editar meta</button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  // Persistir en localStorage → sobrevive refresh sin bugs de routing
  const [strategy, setStrategy] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('dygpro_s') ?? 'session_edge'
    return 'session_edge'
  })
  const [filterFrom, setFilterFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('dygpro_from') ?? ''
    return ''
  })
  const [filterTo, setFilterTo] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('dygpro_to') ?? ''
    return ''
  })

  const handleStrategy = (v: string) => { setStrategy(v); localStorage.setItem('dygpro_s', v) }
  const handleFrom    = (v: string) => { setFilterFrom(v); localStorage.setItem('dygpro_from', v) }
  const handleTo      = (v: string) => { setFilterTo(v); localStorage.setItem('dygpro_to', v) }
  const handleClear   = () => {
    setFilterFrom(''); setFilterTo('')
    localStorage.removeItem('dygpro_from')
    localStorage.removeItem('dygpro_to')
  }

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sessions?strategy=${strategy}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha)))
        }
        setLoading(false)
      })
  }, [strategy])

  const strategyLabel = STRATEGIES.find(s => s.value === strategy)?.label ?? strategy

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando...</div>

  // Filtrar por rango de fechas
  const filtered = sessions.filter(s => {
    if (filterFrom && s.fecha < filterFrom) return false
    if (filterTo && s.fecha > filterTo) return false
    return true
  })

  if (sessions.length === 0) return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <StrategySelector value={strategy} onChange={setStrategy} />
      </div>
      <div className="text-center py-20">
        <p className="text-zinc-500 text-lg mb-4">No hay sesiones para {strategyLabel}</p>
        <a href="/importar" className="text-emerald-400 underline">Importar CSV</a>
      </div>
    </div>
  )

  const kpis        = calcKPIs(filtered)
  const dayStats    = calcDayStats(filtered)
  const dayProfiles = calcDayProfiles(filtered)
  const skipLunSim  = calcSkipDaySim(filtered, 'Lun')
  const domMonthly  = calcMonthlyByDay(filtered, 'Dom')
  const domYearly   = calcYearlyByDay(filtered, 'Dom')
  const domBuckets  = calcPullbackDepthBuckets(filtered, 'Dom')
  const domTop      = calcTopSessions(filtered, 'Dom', 5)
  const domHourHigh = calcHourMapByDay(filtered, 'Dom', 'hora_pico')
  const domHourLow  = calcHourMapByDay(filtered, 'Dom', 'hora_baja')
  const peakDist    = calcPeakDistribution(filtered)
  const streaks     = calcStreaks(filtered)
  const maeMfe      = calcMaeMfe(filtered)
  const hourStats   = calcHourStats(filtered)
  const pullbackSim = calcPullbackSim(filtered)

  // Equity curve — filtrable por día
  const [equityDay, setEquityDay] = useState<string>('Todos')

  const EQUITY_DAYS = ['Todos', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  const normalize = (d: string) => {
    const map: Record<string, string> = {
      'Sun':'Dom','Mon':'Lun','Tue':'Mar','Wed':'Mié','Thu':'Jue','Fri':'Vie','Sat':'Sáb',
      'Domingo':'Dom','Lunes':'Lun','Martes':'Mar',
    }
    return map[d] ?? d
  }

  const equityFiltered = equityDay === 'Todos'
    ? filtered
    : filtered.filter(s => normalize(s.dia) === equityDay)

  const cumData = equityFiltered.map((s, i) => ({
    fecha: s.fecha.slice(5),
    acumulado: Math.round(equityFiltered.slice(0, i + 1).reduce((sum, ss) => sum + (ss.cierre ?? 0), 0)),
  }))

  // P&L por fecha individual
  const pnlByDate: Record<string, number> = {}
  for (const s of filtered) {
    pnlByDate[s.fecha] = (pnlByDate[s.fecha] ?? 0) + (s.cierre ?? 0)
  }
  const dailyPnlData = Object.entries(pnlByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, pnl]) => ({ fecha: fecha.slice(5), pnl: Math.round(pnl) }))

  const kpiCards = [
    { label: 'Total Trades', value: kpis.totalTrades.toString(), color: 'text-white' },
    { label: 'Win Rate', value: kpis.winRate.toFixed(1) + '%', color: kpis.winRate >= 60 ? 'text-emerald-400' : kpis.winRate >= 50 ? 'text-yellow-400' : 'text-red-400' },
    { label: 'Profit Factor', value: kpis.profitFactor.toFixed(2), color: kpis.profitFactor >= 2 ? 'text-emerald-400' : kpis.profitFactor >= 1.3 ? 'text-yellow-400' : 'text-red-400' },
    { label: 'Total P&L', value: (kpis.totalPts >= 0 ? '+' : '') + Math.round(kpis.totalPts).toLocaleString(), color: kpis.totalPts >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Avg Win', value: '+' + Math.round(kpis.avgWin), color: 'text-emerald-400' },
    { label: 'Avg Loss', value: Math.round(kpis.avgLoss).toString(), color: 'text-red-400' },
    { label: 'Max Drawdown', value: Math.round(kpis.maxDD).toString(), color: 'text-red-400' },
    { label: 'Avg / Trade', value: (kpis.avgCierre >= 0 ? '+' : '') + kpis.avgCierre.toFixed(1), color: kpis.avgCierre >= 0 ? 'text-emerald-400' : 'text-red-400' },
  ]

  const streakColor = streaks.currentStreakType === 'win' ? 'text-emerald-400' : streaks.currentStreakType === 'loss' ? 'text-red-400' : 'text-zinc-400'
  const streakEmoji = streaks.currentStreakType === 'win' ? '🔥' : '❄️'

  const isFiltered = filterFrom || filterTo

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <StrategySelector value={strategy} onChange={handleStrategy} />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-zinc-500">Desde</span>
          <input
            type="date"
            value={filterFrom}
            onChange={e => handleFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
          <span className="text-xs text-zinc-500">Hasta</span>
          <input
            type="date"
            value={filterTo}
            onChange={e => handleTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
          {isFiltered && (
            <button
              onClick={handleClear}
              className="text-xs text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded px-2 py-1 transition-colors"
            >
              ✕ limpiar
            </button>
          )}
        </div>
      </div>
      {isFiltered && (
        <p className="text-xs text-amber-400/70">
          Mostrando {filtered.length} de {sessions.length} sesiones
          {filterFrom ? ` desde ${filterFrom}` : ''}
          {filterTo ? ` hasta ${filterTo}` : ''}
        </p>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map(k => (
          <Card key={k.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rachas + Meta semanal */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-base">Rachas</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Racha actual</p>
                <p className={`text-3xl font-bold ${streakColor}`}>{streakEmoji} {streaks.currentStreak}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {streaks.currentStreakType === 'win' ? 'wins seguidos' : 'losses seguidos'}
                </p>
              </div>
              <div className="grid grid-rows-2 gap-3">
                <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">Máx. racha win</p>
                  <p className="text-2xl font-bold text-emerald-400">{streaks.maxWinStreak}</p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">Máx. racha loss</p>
                  <p className="text-2xl font-bold text-red-400">{streaks.maxLossStreak}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <GoalTracker sessions={sessions} />
      </div>

      {/* Equity Curve */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Equity Curve — P&L Acumulado</CardTitle>
              <p className="text-xs text-zinc-500 mt-0.5">
                {equityDay === 'Todos' ? 'Todos los días' : `Solo ${equityDay}`} · {equityFiltered.length} sesiones
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {EQUITY_DAYS.map(d => (
                <button
                  key={d}
                  onClick={() => setEquityDay(d)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    equityDay === d
                      ? 'bg-emerald-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumData}>
              <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                itemStyle={{ color: '#e4e4e7' }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(v: unknown) => { const n = v as number; return [(n >= 0 ? '+' : '') + n.toLocaleString(), 'P&L'] }}
              />
              <Line type="monotone" dataKey="acumulado" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Calendar + Day Stats */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>Actividad — Últimos 90 días</CardTitle></CardHeader>
          <CardContent><CalendarHeatmap sessions={filtered} /></CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>Rendimiento por Día</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dayStats}>
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#a1a1aa' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} itemStyle={{ color: '#e4e4e7' }} labelStyle={{ color: '#a1a1aa' }} />
                <Bar dataKey="avgPts" name="Avg P&L">
                  {dayStats.map((d, i) => <Cell key={i} fill={d.avgPts >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {dayStats.map(d => (
                <div key={d.dia} className="text-center bg-zinc-800/50 rounded p-2">
                  <p className="text-sm font-bold">{d.dia}</p>
                  <p className="text-xs text-zinc-400">{d.trades} trades</p>
                  <p className={`text-sm font-bold ${d.winRate >= 60 ? 'text-emerald-400' : d.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {d.winRate.toFixed(0)}% win
                  </p>
                  <p className={`text-xs font-mono mt-0.5 ${d.totalPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.totalPts >= 0 ? '+' : ''}{Math.round(d.totalPts).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-600">avg {d.avgPts >= 0 ? '+' : ''}{d.avgPts.toFixed(0)}/trade</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribución por día + Simulación Sin Lunes */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>Distribución de Trades por Día</CardTitle>
          <p className="text-xs text-zinc-500 mt-1">¿Dónde están concentradas las pérdidas y ganancias de cada día?</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {dayProfiles.map(dp => {
            const isWeak = dp.winRate < 55
            const BUCKET_COLORS = ['#dc2626', '#f97316', '#71717a', '#34d399', '#10b981', '#059669']
            return (
              <div key={dp.dia} className={`rounded-lg p-3 border ${isWeak ? 'border-red-800/50 bg-red-950/10' : 'border-zinc-800 bg-zinc-800/30'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-base ${isWeak ? 'text-red-400' : 'text-zinc-200'}`}>{dp.dia}</span>
                    {isWeak && <span className="text-xs bg-red-900/60 text-red-300 px-2 py-0.5 rounded-full">⚠ Día débil</span>}
                    <span className="text-xs text-zinc-500">{dp.trades} trades</span>
                  </div>
                  <div className="flex gap-4 text-xs text-right">
                    <span className={dp.winRate >= 60 ? 'text-emerald-400' : dp.winRate >= 55 ? 'text-yellow-400' : 'text-red-400'}>
                      {dp.winRate}% win
                    </span>
                    <span className={dp.avgPts >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      avg {dp.avgPts >= 0 ? '+' : ''}{dp.avgPts}/trade
                    </span>
                    <span className="text-zinc-500">mediana {dp.median >= 0 ? '+' : ''}{dp.median}</span>
                    <span className="text-red-400/70">peor {dp.worst}</span>
                    <span className="text-emerald-400/70">mejor +{dp.best}</span>
                  </div>
                </div>
                {/* Barra de distribución */}
                <div className="flex h-6 rounded overflow-hidden gap-px">
                  {dp.buckets.map((b, i) => (
                    b.count > 0 && (
                      <div
                        key={b.label}
                        style={{ width: `${b.pct}%`, backgroundColor: BUCKET_COLORS[i] }}
                        title={`${b.label}: ${b.count} trades (${b.pct}%)`}
                        className="relative group"
                      >
                        {b.pct >= 8 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                            {b.pct}%
                          </span>
                        )}
                      </div>
                    )
                  ))}
                </div>
                <div className="flex gap-3 mt-1.5 flex-wrap">
                  {dp.buckets.map((b, i) => b.count > 0 && (
                    <span key={b.label} className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <span style={{ backgroundColor: BUCKET_COLORS[i] }} className="inline-block w-2 h-2 rounded-sm" />
                      {b.label}: {b.count}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Simulación Sin Lunes */}
          {skipLunSim.tradeSavings > 0 && (
            <div className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/10 p-4">
              <p className="text-sm font-semibold text-amber-400 mb-3">💡 Simulación: ¿Qué pasa si desactivas la estrategia los lunes?</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Win Rate',
                    before: skipLunSim.kpisWith.winRate.toFixed(1) + '%',
                    after: skipLunSim.kpisWithout.winRate.toFixed(1) + '%',
                    better: skipLunSim.kpisWithout.winRate > skipLunSim.kpisWith.winRate,
                  },
                  {
                    label: 'Profit Factor',
                    before: skipLunSim.kpisWith.profitFactor.toFixed(2),
                    after: skipLunSim.kpisWithout.profitFactor.toFixed(2),
                    better: skipLunSim.kpisWithout.profitFactor > skipLunSim.kpisWith.profitFactor,
                  },
                  {
                    label: 'Max Drawdown',
                    before: Math.round(skipLunSim.kpisWith.maxDD).toLocaleString(),
                    after: Math.round(skipLunSim.kpisWithout.maxDD).toLocaleString(),
                    better: skipLunSim.kpisWithout.maxDD < skipLunSim.kpisWith.maxDD,
                  },
                  {
                    label: 'Total P&L',
                    before: (skipLunSim.kpisWith.totalPts >= 0 ? '+' : '') + Math.round(skipLunSim.kpisWith.totalPts).toLocaleString(),
                    after: (skipLunSim.kpisWithout.totalPts >= 0 ? '+' : '') + Math.round(skipLunSim.kpisWithout.totalPts).toLocaleString(),
                    better: skipLunSim.pnlDelta >= 0,
                  },
                ].map(item => (
                  <div key={item.label} className="bg-zinc-800/50 rounded p-3 text-center">
                    <p className="text-xs text-zinc-500 mb-2">{item.label}</p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-zinc-400 line-through">{item.before}</span>
                      <span className="text-xs text-zinc-600">→</span>
                      <span className={`text-sm font-bold ${item.better ? 'text-emerald-400' : 'text-red-400'}`}>{item.after}</span>
                    </div>
                    {item.better && <p className="text-[10px] text-emerald-500 mt-1">↑ mejora</p>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-3">
                Eliminas <span className="text-amber-400 font-mono">{skipLunSim.tradeSavings}</span> trades de lunes.
                {skipLunSim.pnlDelta >= 0
                  ? <span className="text-emerald-400"> La estrategia mejora +${Math.round(Math.abs(skipLunSim.pnlDelta)).toLocaleString()} sin operar los lunes.</span>
                  : <span className="text-red-400"> Perderías ${Math.round(Math.abs(skipLunSim.pnlDelta)).toLocaleString()} en P&L al saltarte los lunes.</span>
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* P&L por fecha individual */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>P&L por Fecha</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyPnlData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 9, fill: '#71717a' }}
                interval={Math.max(0, Math.floor(dailyPnlData.length / 20) - 1)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} itemStyle={{ color: '#e4e4e7' }} labelStyle={{ color: '#a1a1aa' }}
                formatter={(v: unknown) => { const n = v as number; return [(n >= 0 ? '+' : '') + n.toLocaleString(), 'P&L'] }}
              />
              <Bar dataKey="pnl" name="P&L">
                {dailyPnlData.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-zinc-500 justify-end">
            <span>
              Mejor día:{' '}
              <span className="text-emerald-400 font-mono">
                +{Math.max(...dailyPnlData.map(d => d.pnl)).toLocaleString()}
              </span>
            </span>
            <span>
              Peor día:{' '}
              <span className="text-red-400 font-mono">
                {Math.min(...dailyPnlData.map(d => d.pnl)).toLocaleString()}
              </span>
            </span>
            <span>
              Días con trade: <span className="text-zinc-300">{dailyPnlData.length}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* MAE/MFE + P&L por hora */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>Eficiencia MAE / MFE</CardTitle></CardHeader>
          <CardContent>
            {maeMfe.countWithData === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">Sin datos de MAE/MFE todavía</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-500 mb-1">MFE promedio</p>
                    <p className="text-xl font-bold text-emerald-400">+{Math.round(maeMfe.avgMfe)}</p>
                    <p className="text-xs text-zinc-600">máx a favor</p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-500 mb-1">MAE promedio</p>
                    <p className="text-xl font-bold text-red-400">-{Math.round(maeMfe.avgMae)}</p>
                    <p className="text-xs text-zinc-600">máx en contra</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-500 mb-1">Ratio MFE/MAE</p>
                    <p className={`text-xl font-bold ${maeMfe.avgRatio >= 2 ? 'text-emerald-400' : maeMfe.avgRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {maeMfe.avgRatio.toFixed(1)}x
                    </p>
                    <p className="text-xs text-zinc-600">recompensa/riesgo</p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-500 mb-1">Eficiencia salida</p>
                    <p className={`text-xl font-bold ${maeMfe.avgEfficiency >= 70 ? 'text-emerald-400' : maeMfe.avgEfficiency >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Math.round(maeMfe.avgEfficiency)}%
                    </p>
                    <p className="text-xs text-zinc-600">del MFE capturado</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 text-center">{maeMfe.countWithData} trades con datos completos</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>P&L por Hora de Entrada</CardTitle></CardHeader>
          <CardContent>
            {hourStats.length === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">Sin datos de hora de entrada todavía</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={hourStats}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} itemStyle={{ color: '#e4e4e7' }} labelStyle={{ color: '#a1a1aa' }}
                      formatter={(v: unknown) => { const n = v as number; return [(n >= 0 ? '+' : '') + n, 'Avg P&L'] }}
                    />
                    <Bar dataKey="avgPnl" name="Avg P&L">
                      {hourStats.map((h, i) => <Cell key={i} fill={h.avgPnl >= 0 ? '#10b981' : '#ef4444'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-1 mt-3">
                  {hourStats.map(h => (
                    <div key={h.hour} className="text-center bg-zinc-800/50 rounded p-1.5">
                      <p className="text-xs font-mono text-zinc-400">{h.hour}</p>
                      <p className={`text-xs font-bold ${h.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {h.avgPnl >= 0 ? '+' : ''}{h.avgPnl}
                      </p>
                      <p className="text-xs text-zinc-600">{h.winRate}% · {h.trades}t</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Simulación Entrada en Pullback */}
      {pullbackSim.totalWithPullback > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Simulación — ¿Qué pasa si entras en el retroceso?</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">
              {pullbackSim.totalWithPullback} trades tuvieron retroceso antes de cerrar.
              Simulación: entrar en el punto más bajo (MAE) en vez de la apertura.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Se recuperaron</p>
                <p className="text-2xl font-bold text-emerald-400">{pullbackSim.recoveryRate}%</p>
                <p className="text-xs text-zinc-600">{pullbackSim.recoveredCount} de {pullbackSim.totalWithPullback}</p>
              </div>
              <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Profundidad avg</p>
                <p className="text-2xl font-bold text-red-400">-{pullbackSim.avgPullbackDepth}</p>
                <p className="text-xs text-zinc-600">retroceso en $</p>
              </div>
              <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Win rate simulado</p>
                <p className={`text-2xl font-bold ${pullbackSim.simWinRate >= 60 ? 'text-emerald-400' : pullbackSim.simWinRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {pullbackSim.simWinRate}%
                </p>
                <p className="text-xs text-zinc-600">vs {Math.round((pullbackSim.recoveredCount / pullbackSim.totalWithPullback) * 100)}% real</p>
              </div>
              <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Mejora promedio</p>
                <p className="text-2xl font-bold text-emerald-400">+{pullbackSim.avgImprovement}</p>
                <p className="text-xs text-zinc-600">$ por trade</p>
              </div>
            </div>

            {/* Comparativa real vs simulado */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-800/40 rounded-lg p-4 text-center border border-zinc-700">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Entrada real (apertura)</p>
                <p className={`text-3xl font-bold ${pullbackSim.avgRealPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pullbackSim.avgRealPnl >= 0 ? '+' : ''}{pullbackSim.avgRealPnl}
                </p>
                <p className="text-xs text-zinc-500 mt-1">avg / trade</p>
                <p className={`text-sm mt-2 ${pullbackSim.realTotalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pullbackSim.realTotalPnl >= 0 ? '+' : ''}{pullbackSim.realTotalPnl.toLocaleString()} total
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="text-center">
                  <p className="text-zinc-500 text-sm">vs</p>
                  <p className="text-emerald-400 font-bold text-lg mt-1">
                    +{pullbackSim.avgImprovement}/trade
                  </p>
                  <p className="text-xs text-zinc-500">de diferencia</p>
                </div>
              </div>

              <div className="bg-emerald-950/40 rounded-lg p-4 text-center border border-emerald-800/40">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Entrada en pullback (MAE)</p>
                <p className={`text-3xl font-bold ${pullbackSim.avgSimPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pullbackSim.avgSimPnl >= 0 ? '+' : ''}{pullbackSim.avgSimPnl}
                </p>
                <p className="text-xs text-zinc-500 mt-1">avg / trade</p>
                <p className={`text-sm mt-2 ${pullbackSim.simTotalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pullbackSim.simTotalPnl >= 0 ? '+' : ''}{pullbackSim.simTotalPnl.toLocaleString()} total
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 mt-3 text-center">
              * Simulación asume que logras entrar exactamente en el MAE. En la práctica el timing es más difícil.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── ANÁLISIS DOMINGO ─────────────────────────────────────────── */}
      {domMonthly.length > 0 && (() => {
        const domKpis = calcKPIs(filtered.filter(s => {
          const map: Record<string,string> = { 'Sun':'Dom','Domingo':'Dom' }
          return (map[s.dia] ?? s.dia) === 'Dom'
        }))
        const bestMonth  = [...domMonthly].sort((a,b) => b.totalPnl - a.totalPnl)[0]
        const worstMonth = [...domMonthly].sort((a,b) => a.totalPnl - b.totalPnl)[0]
        const positiveMonths = domMonthly.filter(m => m.totalPnl > 0).length
        const trend = domMonthly.length >= 3
          ? domMonthly.slice(-3).reduce((a,m) => a + m.totalPnl, 0) / 3
          : null
        const trendPrev = domMonthly.length >= 6
          ? domMonthly.slice(-6,-3).reduce((a,m) => a + m.totalPnl, 0) / 3
          : null
        const trendDir = trend !== null && trendPrev !== null
          ? trend > trendPrev ? 'up' : 'down'
          : null

        return (
          <Card className="bg-zinc-900 border-emerald-800/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-emerald-400">🌟 Análisis Domingo — Tu día core</CardTitle>
                  <p className="text-xs text-zinc-500 mt-1">
                    {domMonthly.length} meses · {domKpis.totalTrades} trades · PF {domKpis.profitFactor.toFixed(2)} · {domKpis.winRate.toFixed(1)}% win
                  </p>
                </div>
                <div className={`text-sm font-bold px-3 py-1 rounded-full ${trendDir === 'up' ? 'bg-emerald-900/60 text-emerald-400' : trendDir === 'down' ? 'bg-red-900/60 text-red-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  {trendDir === 'up' ? '↑ Mejorando' : trendDir === 'down' ? '↓ Deteriorando' : '→ Estable'}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* KPIs Domingo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">Total P&L Domingos</p>
                  <p className={`text-2xl font-bold ${domKpis.totalPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {domKpis.totalPts >= 0 ? '+' : ''}{Math.round(domKpis.totalPts).toLocaleString()}
                  </p>
                </div>
                <div className="bg-zinc-800/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">Meses positivos</p>
                  <p className="text-2xl font-bold text-emerald-400">{positiveMonths}<span className="text-sm text-zinc-500">/{domMonthly.length}</span></p>
                </div>
                <div className="bg-zinc-800/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">Mejor mes</p>
                  <p className="text-xl font-bold text-emerald-400">+{bestMonth.totalPnl.toLocaleString()}</p>
                  <p className="text-xs text-zinc-600">{bestMonth.label}</p>
                </div>
                <div className="bg-zinc-800/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">Peor mes</p>
                  <p className="text-xl font-bold text-red-400">{worstMonth.totalPnl.toLocaleString()}</p>
                  <p className="text-xs text-zinc-600">{worstMonth.label}</p>
                </div>
              </div>

              {/* Gráfica P&L mensual Domingo */}
              <div>
                <p className="text-xs text-zinc-500 mb-2">P&L por mes (barras) + tendencia 3 meses (línea)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={domMonthly} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                      itemStyle={{ color: '#e4e4e7' }}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={(v: unknown, name: unknown) => {
                        const n = v as number
                        return [(n >= 0 ? '+' : '') + n.toLocaleString(), name === 'totalPnl' ? 'P&L' : 'Tendencia 3M']
                      }}
                    />
                    <Bar dataKey="totalPnl" name="totalPnl">
                      {domMonthly.map((m, i) => (
                        <Cell key={i} fill={m.totalPnl >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="rolling3" stroke="#f59e0b" strokeWidth={2} dot={false} name="rolling3" connectNulls />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabla mensual */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-500">
                      <th className="text-left py-1.5 px-2">Mes</th>
                      <th className="text-right py-1.5 px-2">Trades</th>
                      <th className="text-right py-1.5 px-2">Win%</th>
                      <th className="text-right py-1.5 px-2">P&L Total</th>
                      <th className="text-right py-1.5 px-2">Avg/trade</th>
                      <th className="text-right py-1.5 px-2">Tend. 3M</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...domMonthly].reverse().map((m, i) => (
                      <tr key={m.month} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? '' : 'bg-zinc-800/20'}`}>
                        <td className="py-1.5 px-2 text-zinc-300 font-medium">{m.label}</td>
                        <td className="py-1.5 px-2 text-right text-zinc-400">{m.trades}</td>
                        <td className={`py-1.5 px-2 text-right font-mono ${m.winRate >= 65 ? 'text-emerald-400' : m.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {m.winRate}%
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono font-bold ${m.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.totalPnl >= 0 ? '+' : ''}{m.totalPnl.toLocaleString()}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${m.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.avgPnl >= 0 ? '+' : ''}{m.avgPnl}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${m.rolling3 === null ? 'text-zinc-600' : m.rolling3 >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                          {m.rolling3 !== null ? (m.rolling3 >= 0 ? '+' : '') + m.rolling3.toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Predictor: Pullback Depth → Win Rate */}
              <div>
                <p className="text-sm font-semibold text-zinc-300 mb-1">
                  🎯 Predictor — La baja predice el resultado
                </p>
                <p className="text-xs text-zinc-500 mb-3">
                  Profundidad del pullback vs probabilidad de ganar (histórico {domBuckets.reduce((a,b)=>a+b.trades,0)} domingos con datos)
                </p>
                <div className="space-y-2">
                  {domBuckets.map(b => {
                    const danger  = b.winRate < 35
                    const caution = b.winRate >= 35 && b.winRate < 60
                    const safe    = b.winRate >= 60
                    const barColor = safe ? '#10b981' : caution ? '#f59e0b' : '#ef4444'
                    return (
                      <div key={b.label} className={`rounded-lg p-3 border ${danger ? 'border-red-800/40 bg-red-950/10' : caution ? 'border-amber-800/40 bg-amber-950/10' : 'border-emerald-800/40 bg-emerald-950/10'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-zinc-300 w-28">{b.label}</span>
                            <span className={`text-lg font-bold ${safe ? 'text-emerald-400' : caution ? 'text-amber-400' : 'text-red-400'}`}>
                              {b.winRate}%
                            </span>
                            <span className="text-xs text-zinc-500">win rate</span>
                            {b.trades > 0 && <span className="text-xs text-zinc-600">({b.trades} trades)</span>}
                          </div>
                          <div className="text-right">
                            <span className={`text-sm font-mono ${b.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {b.avgPnl >= 0 ? '+' : ''}{b.avgPnl} avg
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div style={{ width: `${b.winRate}%`, backgroundColor: barColor }} className="h-full rounded-full transition-all" />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-zinc-600 mt-2">
                  💡 Punto crítico: baja &gt; 150 pts → probabilidad se invierte. El SL de 500 pts cubre los casos extremos.
                </p>
              </div>

              {/* Año por año */}
              <div>
                <p className="text-sm font-semibold text-zinc-300 mb-3">📅 Rendimiento anual — Domingo</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-700 text-zinc-500">
                        <th className="text-left py-1.5 px-2">Año</th>
                        <th className="text-right py-1.5 px-2">Trades</th>
                        <th className="text-right py-1.5 px-2">Win%</th>
                        <th className="text-right py-1.5 px-2">Avg/trade</th>
                        <th className="text-right py-1.5 px-2">Total P&L</th>
                        <th className="text-left py-1.5 px-2">Barra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...domYearly].reverse().map((y, i) => {
                        const maxAbs = Math.max(...domYearly.map(yy => Math.abs(yy.totalPnl)), 1)
                        const barW = Math.round((Math.abs(y.totalPnl) / maxAbs) * 100)
                        return (
                          <tr key={y.year} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? '' : 'bg-zinc-800/20'}`}>
                            <td className="py-2 px-2 font-bold text-zinc-200">{y.year}</td>
                            <td className="py-2 px-2 text-right text-zinc-400">{y.trades}</td>
                            <td className={`py-2 px-2 text-right font-mono ${y.winRate >= 65 ? 'text-emerald-400' : y.winRate >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {y.winRate}%
                            </td>
                            <td className={`py-2 px-2 text-right font-mono ${y.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {y.avgPnl >= 0 ? '+' : ''}{y.avgPnl}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono font-bold ${y.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {y.totalPnl >= 0 ? '+' : ''}{y.totalPnl.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 w-32">
                              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                                <div style={{ width: `${barW}%`, backgroundColor: y.totalPnl >= 0 ? '#10b981' : '#ef4444' }} className="h-full rounded-full" />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top mejores / peores */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-400 mb-2">🏆 Mejores domingos</p>
                  <div className="space-y-1">
                    {domTop.best.map((s, i) => (
                      <div key={s.id ?? i} className="flex items-center justify-between bg-emerald-950/20 border border-emerald-800/30 rounded px-3 py-1.5">
                        <div>
                          <span className="text-xs font-mono text-zinc-300">{s.fecha}</span>
                          {s.baja !== null && (
                            <span className="text-xs text-zinc-500 ml-2">baja {s.baja}</span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-emerald-400">+{s.cierre}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-400 mb-2">💀 Peores domingos</p>
                  <div className="space-y-1">
                    {domTop.worst.map((s, i) => (
                      <div key={s.id ?? i} className="flex items-center justify-between bg-red-950/20 border border-red-800/30 rounded px-3 py-1.5">
                        <div>
                          <span className="text-xs font-mono text-zinc-300">{s.fecha}</span>
                          {s.baja !== null && (
                            <span className="text-xs text-red-400/60 ml-2">baja {s.baja}</span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-red-400">{s.cierre}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Horas pico y baja — solo domingos */}
              <div className="mt-6">
                <p className="text-sm font-semibold text-zinc-300 mb-1">⏰ ¿A qué hora ocurren el máximo y el mínimo?</p>
                <p className="text-xs text-zinc-500 mb-4">Solo domingos — frecuencia por hora del día</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Hora del HIGH */}
                  <div>
                    <p className="text-xs text-emerald-400 font-semibold mb-2">📈 Hora del Máximo (hora_pico)</p>
                    <ResponsiveContainer width="100%" height={Math.max(domHourHigh.length * 28, 100)}>
                      <BarChart data={domHourHigh} layout="vertical" margin={{ left: 8, right: 40 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="hour" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={44} />
                        <Tooltip
                          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                          itemStyle={{ color: '#e4e4e7' }}
                          labelStyle={{ color: '#a1a1aa' }}
                          formatter={(v: unknown, name: unknown) => name === 'Sesiones' ? [`${v}`, 'Sesiones'] : [`${v}%`, '%']}
                        />
                        <Bar dataKey="count" name="Sesiones" fill="#10b981" radius={[0, 4, 4, 0]}>
                          {domHourHigh.map((entry, i) => (
                            <Cell key={i} fill={entry.avgPnl >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Hora del LOW */}
                  <div>
                    <p className="text-xs text-red-400 font-semibold mb-2">📉 Hora del Mínimo (hora_baja)</p>
                    <ResponsiveContainer width="100%" height={Math.max(domHourLow.length * 28, 100)}>
                      <BarChart data={domHourLow} layout="vertical" margin={{ left: 8, right: 40 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="hour" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={44} />
                        <Tooltip
                          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                          itemStyle={{ color: '#e4e4e7' }}
                          labelStyle={{ color: '#a1a1aa' }}
                          formatter={(v: unknown, name: unknown) => name === 'Sesiones' ? [`${v}`, 'Sesiones'] : [`${v}%`, '%']}
                        />
                        <Bar dataKey="count" name="Sesiones" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                </div>

                {/* Top 3 horas resumen */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-400 mb-2">Top horas del HIGH</p>
                    {domHourHigh.slice(0, 3).map((h, i) => (
                      <div key={i} className="flex justify-between text-xs py-0.5">
                        <span className="text-zinc-300 font-mono">{h.hour}</span>
                        <span className="text-zinc-400">{h.count} veces ({h.pct}%)</span>
                        <span className={h.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {h.avgPnl >= 0 ? '+' : ''}{h.avgPnl} avg
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-400 mb-2">Top horas del LOW</p>
                    {domHourLow.slice(0, 3).map((h, i) => (
                      <div key={i} className="flex justify-between text-xs py-0.5">
                        <span className="text-zinc-300 font-mono">{h.hour}</span>
                        <span className="text-zinc-400">{h.count} veces ({h.pct}%)</span>
                        <span className={h.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {h.avgPnl >= 0 ? '+' : ''}{h.avgPnl} avg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        )
      })()}

      {/* Peak Distribution */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle>Distribución Hora Pico (Salida)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={peakDist} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} />
              <YAxis type="category" dataKey="block" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={80} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} itemStyle={{ color: '#e4e4e7' }} labelStyle={{ color: '#a1a1aa' }} />
              <Bar dataKey="pct" name="%" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function StrategySelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200"
    >
      {STRATEGIES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}

