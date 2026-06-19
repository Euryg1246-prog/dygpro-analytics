'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'
import { calcKPIs, calcDayStats, calcPeakDistribution } from '@/lib/calc'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando...</div>
  if (sessions.length === 0) return (
    <div className="text-center py-20">
      <p className="text-zinc-500 text-lg mb-4">No hay sesiones cargadas</p>
      <a href="/importar" className="text-emerald-400 underline">Importar CSV</a>
    </div>
  )

  const kpis = calcKPIs(sessions)
  const dayStats = calcDayStats(sessions)
  const peakDist = calcPeakDistribution(sessions)

  const cumData = sessions.map((s, i) => ({
    fecha: s.fecha,
    acumulado: sessions.slice(0, i + 1).reduce((sum, ss) => sum + (ss.cierre ?? 0), 0),
  }))

  const kpiCards = [
    { label: 'Total Trades', value: kpis.totalTrades.toString(), color: 'text-white' },
    { label: 'Win Rate', value: kpis.winRate.toFixed(1) + '%', color: kpis.winRate >= 60 ? 'text-emerald-400' : kpis.winRate >= 50 ? 'text-yellow-400' : 'text-red-400' },
    { label: 'Profit Factor', value: kpis.profitFactor.toFixed(2), color: kpis.profitFactor >= 2 ? 'text-emerald-400' : kpis.profitFactor >= 1.3 ? 'text-yellow-400' : 'text-red-400' },
    { label: 'Total Puntos', value: Math.round(kpis.totalPts).toLocaleString(), color: kpis.totalPts >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Avg Win', value: Math.round(kpis.avgWin) + ' pts', color: 'text-emerald-400' },
    { label: 'Avg Loss', value: Math.round(kpis.avgLoss) + ' pts', color: 'text-red-400' },
    { label: 'Max Drawdown', value: Math.round(kpis.maxDD) + ' pts', color: 'text-red-400' },
    { label: 'Promedio/Trade', value: (kpis.avgCierre >= 0 ? '+' : '') + kpis.avgCierre.toFixed(1) + ' pts', color: kpis.avgCierre >= 0 ? 'text-emerald-400' : 'text-red-400' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard — NQ Session Edge</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map(k => (
          <Card key={k.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-zinc-500 uppercase">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle>PnL Acumulado</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cumData}>
              <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} labelStyle={{ color: '#a1a1aa' }} />
              <Line type="monotone" dataKey="acumulado" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>Rendimiento por Día</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dayStats}>
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#a1a1aa' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
                <Bar dataKey="avgPts" name="Avg Pts">
                  {dayStats.map((d, i) => (
                    <Cell key={i} fill={d.avgPts >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {dayStats.map(d => (
                <div key={d.dia} className="text-center bg-zinc-800/50 rounded p-2">
                  <p className="text-sm font-bold">{d.dia}</p>
                  <p className="text-xs text-zinc-400">{d.trades} trades</p>
                  <p className={`text-sm font-bold ${d.winRate >= 60 ? 'text-emerald-400' : d.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {d.winRate.toFixed(1)}% win
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle>Distribución Hora Pico</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
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
    </div>
  )
}
