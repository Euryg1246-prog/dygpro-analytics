'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Session } from '@/lib/types'

type SortKey = keyof Session
type SortDir = 'asc' | 'desc'

export default function SesionesPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStrategy, setFilterStrategy] = useState('all')
  const [filterDay, setFilterDay] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sessions?strategy=${filterStrategy}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSessions(data)
        setLoading(false)
      })
  }, [filterStrategy])

  const filtered = useMemo(() => {
    let result = [...sessions]
    if (filterDay) result = result.filter(s => s.dia === filterDay)
    if (filterFrom) result = result.filter(s => s.fecha >= filterFrom)
    if (filterTo) result = result.filter(s => s.fecha <= filterTo)

    result.sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [sessions, filterDay, filterFrom, filterTo, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const columns: { key: SortKey; label: string; format?: (v: number | string | null) => string; color?: (v: number | null) => string }[] = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'dia', label: 'Día' },
    { key: 'strategy', label: 'Estrategia', format: v => v === 'breakout_v4' ? 'Breakout v4' : v === 'session_edge' ? 'Session Edge' : String(v ?? '') },
    { key: 'open_price', label: 'Open', format: v => typeof v === 'number' ? v.toFixed(2) : '' },
    { key: 'baja', label: 'Baja', format: v => typeof v === 'number' ? v.toString() : '', color: () => 'text-red-400' },
    { key: 'cierre', label: 'Cierre', format: v => typeof v === 'number' ? (v >= 0 ? '+' + v : v.toString()) : '', color: v => (v ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { key: 'max_alta', label: 'Max Alta', format: v => typeof v === 'number' ? '+' + v : '', color: () => 'text-emerald-400' },
    { key: 'hora_pico', label: 'Hora Pico' },
    { key: 'hora_baja', label: 'Hora Baja', color: () => 'text-yellow-400' },
    { key: 'min_pico', label: 'Min Pico' },
    { key: 'recuperacion', label: 'Recup.', format: v => typeof v === 'number' ? '+' + v : '' },
    { key: 'rec_pct', label: 'Rec%', format: v => typeof v === 'number' ? v + '%' : '' },
    { key: 'dev_max', label: 'Dev Max', format: v => typeof v === 'number' ? v.toString() : '' },
    { key: 'mfe_mae', label: 'MFE/MAE', format: v => typeof v === 'number' ? v.toFixed(1) : '' },
    { key: 'acumulado', label: 'Acum.', format: v => typeof v === 'number' ? (v >= 0 ? '+' + Math.round(v) : Math.round(v).toString()) : '', color: v => (v ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
  ]

  if (loading) return <div className="text-zinc-500 text-center py-20">Cargando...</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sesiones ({filtered.length})</h1>

      <div className="flex gap-4 flex-wrap items-end">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Estrategia</label>
          <select value={filterStrategy} onChange={e => setFilterStrategy(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200">
            <option value="all">Todas</option>
            <option value="session_edge">Session Edge</option>
            <option value="breakout_v4">Breakout v4</option>
            <option value="open_below_80">Open Below 80%</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Día</label>
          <select value={filterDay} onChange={e => setFilterDay(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200">
            <option value="">Todos</option>
            <option value="Dom">Domingo</option>
            <option value="Lun">Lunes</option>
            <option value="Mar">Martes</option>
            <option value="Mié">Miércoles</option>
            <option value="Jue">Jueves</option>
            <option value="Vie">Viernes</option>
            <option value="Sáb">Sábado</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Desde</label>
          <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="bg-zinc-800 border-zinc-700 w-40" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Hasta</label>
          <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="bg-zinc-800 border-zinc-700 w-40" />
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700">
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="py-2 px-2 text-left text-zinc-400 cursor-pointer hover:text-white select-none"
                    >
                      {col.label} {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr
                    key={s.id || i}
                    onClick={() => s.id && router.push(`/sesiones/${s.id}`)}
                    className={`border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-700/40 transition-colors ${i % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-900/50'}`}
                  >
                    {columns.map(col => {
                      const val = s[col.key]
                      const display = col.format ? col.format(val as number) : (val?.toString() ?? '')
                      const colorClass = col.color ? col.color(val as number | null) : 'text-zinc-300'
                      return <td key={col.key} className={`py-1.5 px-2 ${colorClass}`}>{display}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
