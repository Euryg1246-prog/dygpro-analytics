'use client'

import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Session } from '@/lib/types'

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const STRATEGY_LABELS: Record<string, string> = {
  session_edge: 'NQ Session Edge',
  breakout_v4: 'Breakout Long v4',
  open_below_80: 'Open Below 80%',
}

// ─── Detectar si es CSV de TradingView ───────────────────────────────────────
function isTradingViewCSV(headers: string[]): boolean {
  return headers.some(h => h.includes('Trade number') || h.includes('Señal') || h.includes('PyG netas'))
}

// ─── Auto-detectar estrategia desde señales y nombre de archivo ───────────────
function detectStrategy(rows: Record<string, string>[], filename: string): { strategy: string; confidence: 'alta' | 'baja' } {
  const signals = rows.map(r => r['Señal'] || '').join(' ')

  if (signals.includes('ENTRY_LONG') || signals.includes('EXIT')) {
    return { strategy: 'breakout_v4', confidence: 'alta' }
  }
  if (signals.includes('▲') || signals.includes('▼') || signals.includes('DOM')) {
    return { strategy: 'session_edge', confidence: 'alta' }
  }

  // Fallback: nombre de archivo
  const lower = filename.toLowerCase()
  if (lower.includes('breakout')) return { strategy: 'breakout_v4', confidence: 'alta' }
  if (lower.includes('session edge') || lower.includes('session_edge')) return { strategy: 'session_edge', confidence: 'alta' }
  if (lower.includes('open_below') || lower.includes('below 80')) return { strategy: 'open_below_80', confidence: 'alta' }

  return { strategy: 'session_edge', confidence: 'baja' }
}

// ─── Parsear CSV de TradingView ───────────────────────────────────────────────
function parseTradingViewCSV(rows: Record<string, string>[], strategy: string): Session[] {
  // Agrupar por número de trade
  const trades: Record<string, { entry?: Record<string, string>; exit?: Record<string, string> }> = {}

  for (const row of rows) {
    const num = row['Trade number']?.trim()
    const tipo = row['Tipo'] || ''
    if (!num) continue
    if (!trades[num]) trades[num] = {}
    if (tipo.includes('Entrada')) trades[num].entry = row
    else if (tipo.includes('Salida')) trades[num].exit = row
  }

  const sessions: Session[] = []

  for (const trade of Object.values(trades)) {
    const entry = trade.entry
    if (!entry) continue

    const fechaHora = entry['Fecha y hora'] || ''
    const [fechaRaw, horaEntry] = fechaHora.split(' ')
    const fecha = fechaRaw // ya viene YYYY-MM-DD

    const exitFechaHora = trade.exit?.['Fecha y hora'] || ''
    const horaExit = exitFechaHora.split(' ')[1] || null

    const d = new Date(fecha + 'T12:00:00')
    const dia = isNaN(d.getTime()) ? '' : DAYS_ES[d.getDay()]

    const pnl = parseFloat(entry['PyG netas USD'] || '0')
    const mfe = parseFloat(entry['Desviación favorable USD'] || '0')
    const mae = parseFloat(entry['Desviación adversa USD'] || '0') // negativo
    const acum = parseFloat(entry['PyG acumuladas USD'] || '0')
    const openPrice = parseFloat(entry['Precio USD'] || '0')

    const mfeMae = mae !== 0 ? Math.round((mfe / Math.abs(mae)) * 10) / 10 : null

    sessions.push({
      strategy,
      fecha,
      dia,
      open_price: openPrice || null,
      cierre: isNaN(pnl) ? null : pnl,
      max_alta: isNaN(mfe) || mfe === 0 ? null : mfe,
      baja: isNaN(mae) || mae === 0 ? null : mae,
      hora_pico: horaExit ? horaExit.substring(0, 5) : null,
      hora_baja: horaEntry ? horaEntry.substring(0, 5) : null,
      mfe_mae: mfeMae,
      acumulado: isNaN(acum) || acum === 0 ? null : acum,
      min_pico: null,
      recuperacion: null,
      rec_pct: null,
      dev_max: null,
      source: 'csv_tradingview',
    })
  }

  return sessions
}

// ─── Parsear CSV propio (formato manual) ─────────────────────────────────────
function parseCustomCSV(rows: Record<string, string>[], strategy: string): Session[] {
  const parseNum = (v: string | undefined) => {
    if (!v) return null
    const cleaned = v.replace(/[+%]/g, '').trim()
    if (cleaned === '' || cleaned === 'N/A') return null
    return parseFloat(cleaned)
  }

  const normalizeFecha = (raw: string): string => {
    const match = raw.match(/(\w+)\/(\d+)\/(\d+)\/(\d{4})/)
    if (match) {
      const [, , month, day, year] = match
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) return raw
    return raw
  }

  return rows
    .map(row => {
      const fecha = row.fecha?.trim()
      if (!fecha) return null
      return {
        strategy,
        fecha: normalizeFecha(fecha),
        dia: row.dia?.trim() || '',
        open_price: parseNum(row.open),
        baja: parseNum(row.baja),
        cierre: parseNum(row.cierre),
        max_alta: parseNum(row.max_alta),
        hora_pico: row.hora_pico?.trim() || null,
        hora_baja: row.hora_baja?.trim() || null,
        min_pico: parseNum(row.min_pico) !== null ? Math.round(parseNum(row.min_pico)!) : null,
        recuperacion: parseNum(row.recuperacion),
        rec_pct: parseNum(row.rec_pct),
        dev_max: parseNum(row.dev_max),
        mfe_mae: parseNum(row.mfe_mae),
        acumulado: parseNum(row.acumulado),
        source: 'csv',
      } as Session
    })
    .filter((s): s is Session => s !== null)
}

const KNOWN_STRATEGIES = ['session_edge', 'breakout_v4', 'open_below_80']

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ImportarPage() {
  const [preview, setPreview] = useState<Session[]>([])
  const [strategy, setStrategy] = useState('session_edge')
  const [customStrategy, setCustomStrategy] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [detectedStrategy, setDetectedStrategy] = useState<{ strategy: string; confidence: 'alta' | 'baja' } | null>(null)
  const [isTradingView, setIsTradingView] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const activeStrategy = showCustom ? customStrategy.trim() || strategy : strategy

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[]
        const headers = results.meta.fields || []
        const tv = isTradingViewCSV(headers)
        setIsTradingView(tv)

        let sessions: Session[]
        if (tv) {
          const detected = detectStrategy(rows, file.name)
          setDetectedStrategy(detected)
          // Si la estrategia detectada no está en la lista conocida, mostrar campo custom
          if (!KNOWN_STRATEGIES.includes(detected.strategy)) {
            setShowCustom(true)
            setCustomStrategy(detected.strategy)
          } else {
            setShowCustom(false)
            setStrategy(detected.strategy)
          }
          sessions = parseTradingViewCSV(rows, detected.strategy)
        } else {
          setDetectedStrategy(null)
          sessions = parseCustomCSV(rows, strategy)
        }

        setPreview(sessions)
        setStatus(`${sessions.length} trades detectados${tv ? ' (formato TradingView)' : ''}`)
      },
    })
  }, [strategy])

  const handleStrategyChange = (newStrategy: string) => {
    if (newStrategy === '__custom__') {
      setShowCustom(true)
    } else {
      setShowCustom(false)
      setStrategy(newStrategy)
      if (preview.length > 0) {
        setPreview(prev => prev.map(s => ({ ...s, strategy: newStrategy })))
      }
    }
  }

  const handleCustomChange = (val: string) => {
    setCustomStrategy(val)
    if (preview.length > 0) {
      setPreview(prev => prev.map(s => ({ ...s, strategy: val.trim() || strategy })))
    }
  }

  const handleImport = async () => {
    if (preview.length === 0) return
    if (!activeStrategy) { setStatus('Error: define el nombre de la estrategia'); return }
    setImporting(true)
    setStatus('Importando...')
    // Asegurar que todos los registros tienen la estrategia correcta
    const toImport = preview.map(s => ({ ...s, strategy: activeStrategy }))

    const batchSize = 100
    let total = 0

    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize)
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

    setStatus(`✓ ${total} sesiones importadas`)
    setImporting(false)
    setPreview([])
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Importar Sesiones</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Subir CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Archivo CSV (TradingView o formato propio)</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
            />
          </div>

          {/* Estrategia detectada o selector */}
          {isTradingView && detectedStrategy && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">Estrategia detectada:</span>
              <span className={`text-xs px-2 py-1 rounded font-mono ${detectedStrategy.confidence === 'alta' ? 'bg-emerald-900 text-emerald-300' : 'bg-yellow-900 text-yellow-300'}`}>
                {STRATEGY_LABELS[detectedStrategy.strategy] || detectedStrategy.strategy}
              </span>
              {detectedStrategy.confidence === 'baja' && (
                <span className="text-xs text-yellow-400">— baja confianza, verifica abajo</span>
              )}
            </div>
          )}

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                {isTradingView ? 'Estrategia (verifica antes de importar)' : 'Estrategia'}
              </label>
              <select
                value={showCustom ? '__custom__' : strategy}
                onChange={e => handleStrategyChange(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200"
              >
                <option value="session_edge">NQ Session Edge</option>
                <option value="breakout_v4">Breakout Long v4</option>
                <option value="open_below_80">Open Below 80%</option>
                <option value="__custom__">+ Nueva estrategia…</option>
              </select>
            </div>
            {showCustom && (
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Nombre de la estrategia</label>
                <input
                  type="text"
                  value={customStrategy}
                  onChange={e => handleCustomChange(e.target.value)}
                  placeholder="ej: reversal_v1"
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 w-52"
                />
              </div>
            )}
          </div>

          {status && (
            <div className={`text-sm ${status.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {status}
            </div>
          )}
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              Preview — {STRATEGY_LABELS[activeStrategy] || activeStrategy} ({preview.length} trades)
            </CardTitle>
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
                    <th className="py-2 px-2 text-right">Baja (MAE)</th>
                    <th className="py-2 px-2 text-right">Cierre P&L</th>
                    <th className="py-2 px-2 text-right">Max Alta (MFE)</th>
                    <th className="py-2 px-2 text-center">Entrada</th>
                    <th className="py-2 px-2 text-center">Salida</th>
                    <th className="py-2 px-2 text-right">MFE/MAE</th>
                    <th className="py-2 px-2 text-right">Acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 25).map((s, i) => (
                    <tr key={i} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? '' : 'bg-zinc-800/20'}`}>
                      <td className="py-1.5 px-2">{s.fecha}</td>
                      <td className="py-1.5 px-2">{s.dia}</td>
                      <td className="py-1.5 px-2 text-right text-zinc-400">{s.open_price?.toFixed(2) || '—'}</td>
                      <td className="py-1.5 px-2 text-right text-red-400">{s.baja ?? '—'}</td>
                      <td className={`py-1.5 px-2 text-right font-medium ${(s.cierre ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.cierre !== null ? `${(s.cierre ?? 0) >= 0 ? '+' : ''}${s.cierre}` : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-400">{s.max_alta ? `+${s.max_alta}` : '—'}</td>
                      <td className="py-1.5 px-2 text-center text-zinc-400">{s.hora_baja || '—'}</td>
                      <td className="py-1.5 px-2 text-center text-zinc-400">{s.hora_pico || '—'}</td>
                      <td className="py-1.5 px-2 text-right">{s.mfe_mae ?? '—'}</td>
                      <td className={`py-1.5 px-2 text-right ${(s.acumulado ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.acumulado ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 25 && (
                <p className="text-xs text-zinc-500 mt-2 px-2">…y {preview.length - 25} trades más</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
