'use client'

import { useEffect, useState, useCallback } from 'react'

interface TradeEvent {
  id: number
  created_at: string
  ticker: string
  action: string
  qty: number
  order_type: string
  raw_json: Record<string, unknown>
}

function nyTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `hace ${diff}s`
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

export default function AlertasPage() {
  const [events, setEvents]         = useState<TradeEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [expanded, setExpanded]     = useState<number | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/alert')
      if (res.ok) {
        setEvents(await res.json())
        setLastRefresh(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    const t = setInterval(fetchEvents, 15_000)
    return () => clearInterval(t)
  }, [fetchEvents])

  const tenMinAgo   = Date.now() - 10 * 60 * 1000
  const recentCount = events.filter(e => new Date(e.created_at).getTime() > tenMinAgo).length
  const buyCount    = events.filter(e => e.action === 'buy').length
  const sellCount   = events.filter(e => e.action === 'sell').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🔔 Alertas de Trading</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Log en tiempo real · actualiza cada 15s
          </p>
        </div>
        <button
          onClick={fetchEvents}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition hover:border-zinc-500"
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl p-4 border ${recentCount > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
          <div className={`text-2xl font-bold flex items-center gap-2 ${recentCount > 0 ? 'text-green-400' : 'text-zinc-500'}`}>
            {recentCount > 0 && (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
              </span>
            )}
            {recentCount > 0 ? recentCount : '—'}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Últimos 10 min</div>
        </div>
        <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
          <div className="text-2xl font-bold text-green-400">{buyCount}</div>
          <div className="text-xs text-zinc-400 mt-1">▲ Entradas</div>
        </div>
        <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
          <div className="text-2xl font-bold text-red-400">{sellCount}</div>
          <div className="text-xs text-zinc-400 mt-1">▼ Salidas</div>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 space-y-2">
        <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">URL del Webhook</div>
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-emerald-400 text-sm font-mono truncate">
            https://analytics.dygpro.com/api/alert
          </code>
          <button
            onClick={() => navigator.clipboard.writeText('https://analytics.dygpro.com/api/alert')}
            className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded px-2 py-1.5 shrink-0 transition"
          >
            Copiar
          </button>
        </div>
        <div className="text-xs text-zinc-500">
          Header: <code className="text-zinc-400">x-webhook-secret: dygpro_webhook_2026</code>
        </div>
      </div>

      {/* Sin eventos */}
      {!loading && events.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center space-y-2">
          <div className="text-4xl">📡</div>
          <div className="text-white font-semibold">Sin alertas registradas</div>
          <div className="text-zinc-500 text-sm">Configura Make.com para enviar a la URL de arriba</div>
        </div>
      )}

      {/* Log */}
      {events.length > 0 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">{events.length} alertas registradas</span>
            {lastRefresh && (
              <span className="text-xs text-zinc-500">
                {lastRefresh.toLocaleTimeString('en-US', { hour12: false })}
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-800/60">
            {events.map(ev => {
              const isRecent = new Date(ev.created_at).getTime() > tenMinAgo
              const isBuy    = ev.action === 'buy'
              const isOpen   = expanded === ev.id

              return (
                <div key={ev.id} className={isRecent ? 'bg-zinc-800/30' : ''}>
                  <button
                    className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-zinc-800/50 transition"
                    onClick={() => setExpanded(isOpen ? null : ev.id)}
                  >
                    <div className={`text-xl font-bold w-6 ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                      {isBuy ? '▲' : '▼'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-sm font-bold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                          {isBuy ? 'ENTRADA' : 'SALIDA'}
                        </span>
                        <span className="text-white font-semibold">{ev.qty} MNQ</span>
                        <span className="text-zinc-500 text-xs">{ev.ticker}</span>
                        {isRecent && (
                          <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">RECIENTE</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {nyTime(ev.created_at)} NY · {timeAgo(ev.created_at)}
                      </div>
                    </div>
                    <span className="text-zinc-600 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4">
                      <pre className="bg-zinc-950 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto font-mono">
                        {JSON.stringify(ev.raw_json, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
