'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'
import { calcKPIs, calcDayStats, calcPeakDistribution } from '@/lib/calc'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'

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

  // Pad to start on Sunday
  const firstDay = new Date(days[0].date).getDay()
  const padded = Array(firstDay).fill(null).concat(days)

  const weeks: (typeof days[0] | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }

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
              <div
                key={di}
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

  const kpis = calcKPIs(sessions)
  const dayStats = calcDayStats(sessions)
  const peakDist = calcPeakDistribution(sessions)

  const cumData = sessions.map((s, i) => ({
    fecha: s.fecha.slice(5), // MM-DD
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
          <CardContent>
            <CalendarHeatmap sessions={sessions} />
          </CardContent>
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
                  {dayStats.map((d, i) => (
                    <Cell key={i} fill={d.avgPts >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
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

      {/* Peak Distribution */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle>Distribución Hora Pico</CardTitle></CardHeader>
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
