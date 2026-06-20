'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'
import {
  calcKPIs, calcDayStats, calcPeakDistribution,
  calcStreaks, calcMaeMfe, calcHourStats,
  calcWeeklyPnl, calcTodayPnl, calcPullbackSim,
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
  const [strategy, setStrategy] = useState('session_edge')

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

  const kpis        = calcKPIs(sessions)
  const dayStats    = calcDayStats(sessions)
  const peakDist    = calcPeakDistribution(sessions)
  const streaks     = calcStreaks(sessions)
  const maeMfe      = calcMaeMfe(sessions)
  const hourStats   = calcHourStats(sessions)
  const pullbackSim = calcPullbackSim(sessions)

  const cumData = sessions.map((s, i) => ({
    fecha: s.fecha.slice(5),
    acumulado: Math.round(sessions.slice(0, i + 1).reduce((sum, ss) => sum + (ss.cierre ?? 0), 0)),
  }))

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <StrategySelector value={strategy} onChange={setStrategy} />
        <span className="text-zinc-500 text-sm ml-auto">{strategyLabel}</span>
      </div>

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
        <CardHeader><CardTitle>Equity Curve — P&L Acumulado</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumData}>
              <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
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
          <CardContent><CalendarHeatmap sessions={sessions} /></CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>Rendimiento por Día</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dayStats}>
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#a1a1aa' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

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
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
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

      {/* Peak Distribution */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle>Distribución Hora Pico (Salida)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={peakDist} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} />
              <YAxis type="category" dataKey="block" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={80} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
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
