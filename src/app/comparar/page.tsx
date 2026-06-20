'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'
import { calcKPIs } from '@/lib/calc'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const STRATEGIES = [
  { value: 'session_edge', label: 'Session Edge', color: '#10b981' },
  { value: 'breakout_v4', label: 'Breakout v4', color: '#6366f1' },
]

function KPIRow({ label, a, b, higherIsBetter = true }: {
  label: string
  a: string
  b: string
  higherIsBetter?: boolean
}) {
  const aNum = parseFloat(a.replace(/[^-\d.]/g, ''))
  const bNum = parseFloat(b.replace(/[^-\d.]/g, ''))
  const aWins = higherIsBetter ? aNum > bNum : aNum < bNum
  const bWins = higherIsBetter ? bNum > aNum : bNum < aNum

  return (
    <tr className="border-b border-zinc-800/50">
      <td className="py-2 px-3 text-zinc-400 text-sm">{label}</td>
      <td className={`py-2 px-3 text-right font-mono text-sm ${aWins ? 'text-emerald-400 font-bold' : 'text-zinc-300'}`}>{a}</td>
      <td className={`py-2 px-3 text-right font-mono text-sm ${bWins ? 'text-emerald-400 font-bold' : 'text-zinc-300'}`}>{b}</td>
    </tr>
  )
}

export default function CompararPage() {
  const [data, setData] = useState<Record<string, Session[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all(
      STRATEGIES.map(s =>
        fetch(`/api/sessions?strategy=${s.value}`)
          .then(r => r.json())
          .then(d => ({ key: s.value, sessions: Array.isArray(d) ? d : [] }))
      )
    ).then(results => {
      const map: Record<string, Session[]> = {}
      results.forEach(r => {
        map[r.key] = r.sessions.sort((a: Session, b: Session) => a.fecha.localeCompare(b.fecha))
      })
      setData(map)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando...</div>

  const kpis = STRATEGIES.map(s => ({ ...s, kpis: calcKPIs(data[s.value] ?? []) }))
  const [a, b] = kpis

  // Equity curves combinadas
  const allDates = [...new Set([
    ...(data['session_edge'] ?? []).map(s => s.fecha),
    ...(data['breakout_v4'] ?? []).map(s => s.fecha),
  ])].sort()

  let cumA = 0, cumB = 0
  const equityData = allDates.map(fecha => {
    const sessA = (data['session_edge'] ?? []).filter(s => s.fecha === fecha)
    const sessB = (data['breakout_v4'] ?? []).filter(s => s.fecha === fecha)
    cumA += sessA.reduce((s, r) => s + (r.cierre ?? 0), 0)
    cumB += sessB.reduce((s, r) => s + (r.cierre ?? 0), 0)
    return { fecha: fecha.slice(5), session_edge: Math.round(cumA), breakout_v4: Math.round(cumB) }
  })

  const fmt = (n: number, prefix = '') => n !== 0 ? `${prefix}${Math.round(n).toLocaleString()}` : '—'
  const fmtPct = (n: number) => `${n.toFixed(1)}%`

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Comparador de Estrategias</h1>

      {/* Equity curve */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle>Equity Curve Comparada</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={equityData}>
              <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} labelStyle={{ color: '#a1a1aa' }} />
              <Legend />
              {STRATEGIES.map(s => (
                <Line key={s.value} type="monotone" dataKey={s.value} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* KPI Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>KPIs lado a lado</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="py-3 px-3 text-left text-xs text-zinc-500 uppercase">Métrica</th>
                {STRATEGIES.map(s => (
                  <th key={s.value} className="py-3 px-3 text-right text-sm font-bold" style={{ color: s.color }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <KPIRow label="Total Trades" a={a.kpis.totalTrades.toString()} b={b.kpis.totalTrades.toString()} />
              <KPIRow label="Win Rate" a={fmtPct(a.kpis.winRate)} b={fmtPct(b.kpis.winRate)} />
              <KPIRow label="Profit Factor" a={a.kpis.profitFactor.toFixed(2)} b={b.kpis.profitFactor.toFixed(2)} />
              <KPIRow label="Total P&L" a={fmt(a.kpis.totalPts, '+')} b={fmt(b.kpis.totalPts, '+')} />
              <KPIRow label="Avg / Trade" a={a.kpis.avgCierre.toFixed(1)} b={b.kpis.avgCierre.toFixed(1)} />
              <KPIRow label="Avg Win" a={fmt(a.kpis.avgWin, '+')} b={fmt(b.kpis.avgWin, '+')} />
              <KPIRow label="Avg Loss" a={fmt(a.kpis.avgLoss)} b={fmt(b.kpis.avgLoss)} higherIsBetter={false} />
              <KPIRow label="Max Drawdown" a={fmt(a.kpis.maxDD)} b={fmt(b.kpis.maxDD)} higherIsBetter={false} />
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Totales rapidos */}
      <div className="grid grid-cols-2 gap-4">
        {kpis.map(s => (
          <Card key={s.value} className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base" style={{ color: s.color }}>{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-zinc-500">Trades:</span> <span className="font-bold">{s.kpis.totalTrades}</span></p>
              <p><span className="text-zinc-500">Win Rate:</span> <span className={`font-bold ${s.kpis.winRate >= 60 ? 'text-emerald-400' : s.kpis.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{s.kpis.winRate.toFixed(1)}%</span></p>
              <p><span className="text-zinc-500">Profit Factor:</span> <span className="font-bold">{s.kpis.profitFactor.toFixed(2)}</span></p>
              <p><span className="text-zinc-500">Total P&L:</span> <span className={`font-bold ${s.kpis.totalPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(s.kpis.totalPts >= 0 ? '+' : '') + Math.round(s.kpis.totalPts).toLocaleString()}</span></p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
