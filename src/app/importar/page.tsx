'use client'

import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'

function parseRow(row: Record<string, string>, strategy: string): Session | null {
  const fecha = row.fecha?.trim()
  if (!fecha) return null

  const dia = row.dia?.trim() || ''
  const parseNum = (v: string | undefined) => {
    if (!v) return null
    const cleaned = v.replace(/[+%]/g, '').trim()
    if (cleaned === '' || cleaned === 'N/A') return null
    return parseFloat(cleaned)
  }

  return {
    strategy,
    fecha: normalizeFecha(fecha),
    dia,
    open_price: parseNum(row.open),
    baja: parseNum(row.baja),
    cierre: parseNum(row.cierre),
    max_alta: parseNum(row.max_alta),
    hora_pico: row.hora_pico?.trim() || null,
    hora_baja: row.hora_baja?.trim() || null,
    min_pico: parseNum(row.min_pico) ? Math.round(parseNum(row.min_pico)!) : null,
    recuperacion: parseNum(row.recuperacion),
    rec_pct: parseNum(row.rec_pct),
    dev_max: parseNum(row.dev_max),
    mfe_mae: parseNum(row.mfe_mae),
    acumulado: parseNum(row.acumulado),
    source: 'csv',
  }
}

function normalizeFecha(raw: string): string {
  const match = raw.match(/(\w+)\/(\d+)\/(\d+)\\?(\d{4})/)
  if (match) {
    const [, , month, day, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) return raw
  return raw
}

export default function ImportarPage() {
  const [preview, setPreview] = useState<Session[]>([])
  const [strategy, setStrategy] = useState('session_edge')
  const [status, setStatus] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[]
        const sessions = rows
          .map(r => parseRow(r, strategy))
          .filter((s): s is Session => s !== null)
        setPreview(sessions)
        setStatus(`${sessions.length} sesiones detectadas`)
      },
    })
  }, [strategy])

  const handleImport = async () => {
    if (preview.length === 0) return
    setImporting(true)
    setStatus('Importando...')

    const batchSize = 100
    let total = 0

    for (let i = 0; i < preview.length; i += batchSize) {
      const batch = preview.slice(i, i + batchSize)
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: batch }),
      })
      const data = await res.json()
      if (data.error) {
        setStatus(`Error: ${data.error}`)
        setImporting(false)
        return
      }
      total += data.imported
    }

    setStatus(`Importadas ${total} sesiones`)
    setImporting(false)
    setPreview([])
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Importar Sesiones</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Subir CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Estrategia</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
              >
                <option value="session_edge">Session Edge</option>
                <option value="breakout_v4">Breakout v4</option>
                <option value="open_below_80">Open Below 80%</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Archivo CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
              />
            </div>
          </div>

          <div className="text-xs text-zinc-500">
            Formato: fecha,dia,open,baja,cierre,max_alta,hora_pico,hora_baja,min_pico,recuperacion,rec_pct,dev_max,mfe_mae,acumulado
          </div>

          {status && (
            <div className="text-sm text-emerald-400">{status}</div>
          )}
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Preview ({preview.length} sesiones)</CardTitle>
            <Button onClick={handleImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700">
              {importing ? 'Importando...' : 'Confirmar Importar'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800">
                    <th className="py-2 px-2 text-left">Fecha</th>
                    <th className="py-2 px-2 text-left">Día</th>
                    <th className="py-2 px-2 text-right">Open</th>
                    <th className="py-2 px-2 text-right">Baja</th>
                    <th className="py-2 px-2 text-right">Cierre</th>
                    <th className="py-2 px-2 text-right">Max Alta</th>
                    <th className="py-2 px-2">Hora Pico</th>
                    <th className="py-2 px-2">Hora Baja</th>
                    <th className="py-2 px-2 text-right">MFE/MAE</th>
                    <th className="py-2 px-2 text-right">Acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((s, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="py-1 px-2">{s.fecha}</td>
                      <td className="py-1 px-2">{s.dia}</td>
                      <td className="py-1 px-2 text-right">{s.open_price?.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right text-red-400">{s.baja}</td>
                      <td className={`py-1 px-2 text-right ${(s.cierre ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(s.cierre ?? 0) >= 0 ? '+' : ''}{s.cierre}
                      </td>
                      <td className="py-1 px-2 text-right text-emerald-400">+{s.max_alta}</td>
                      <td className="py-1 px-2 text-center">{s.hora_pico}</td>
                      <td className="py-1 px-2 text-center text-yellow-400">{s.hora_baja}</td>
                      <td className="py-1 px-2 text-right">{s.mfe_mae}</td>
                      <td className={`py-1 px-2 text-right ${(s.acumulado ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.acumulado}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && (
                <p className="text-xs text-zinc-500 mt-2">...y {preview.length - 20} sesiones más</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
