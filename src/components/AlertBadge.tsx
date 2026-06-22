'use client'

import { useEffect, useRef, useState } from 'react'

interface TradeEvent {
  id: number
  created_at: string
  ticker: string
  action: string
  qty: number
  order_type: string
  forwarded: boolean
  forward_ok: boolean | null
  forward_status: number | null
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function nyTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

export function AlertBadge() {
  const [events, setEvents]     = useState<TradeEvent[]>([])
  const [open, setOpen]         = useState(false)
  const [isNew, setIsNew]       = useState(false)
  const prevCount               = useRef(0)
  const panelRef                = useRef<HTMLDivElement>(null)

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/alert')
      if (!res.ok) return
      const data: TradeEvent[] = await res.json()
      setEvents(data)

      // ¿Llegó algo nuevo en los últimos 5 minutos?
      const fiveMinAgo = Date.now() - 5 * 60 * 1000
      const recent = data.filter(e => new Date(e.created_at).getTime() > fiveMinAgo)
      setIsNew(recent.length > 0 && data.length !== prevCount.current)
      prevCount.current = data.length
    } catch (_) {}
  }

  // Poll cada 15 segundos
  useEffect(() => {
    fetchEvents()
    const t = setInterval(fetchEvents, 15_000)
    return () => clearInterval(t)
  }, [])

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ¿Hubo algo en los últimos 10 minutos?
  const tenMinAgo   = Date.now() - 10 * 60 * 1000
  const recentCount = events.filter(e => new Date(e.created_at).getTime() > tenMinAgo).length
  const lastEvent   = events[0]

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); setIsNew(false) }}
        className="relative flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition hover:bg-zinc-800"
        title="Alertas de trading"
      >
        {/* Dot indicator */}
        <span className="relative flex h-2.5 w-2.5">
          {recentCount > 0 ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-600" />
          )}
        </span>
        <span className={recentCount > 0 ? 'text-green-400' : 'text-zinc-400'}>
          {recentCount > 0 ? `🔔 ${recentCount}` : '🔔'}
        </span>
        {isNew && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-bold text-white">Alertas recientes</span>
            <a href="/alertas" className="text-xs text-blue-400 hover:underline">ver todo →</a>
          </div>

          {events.length === 0 ? (
            <div className="px-4 py-6 text-center text-zinc-500 text-xs">
              Sin alertas registradas
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800">
              {events.slice(0, 10).map(ev => {
                const isRecent = new Date(ev.created_at).getTime() > tenMinAgo
                return (
                  <div
                    key={ev.id}
                    className={`px-4 py-3 flex items-start gap-3 ${isRecent ? 'bg-zinc-800/60' : ''}`}
                  >
                    {/* Icono acción */}
                    <div className={`mt-0.5 text-lg leading-none ${ev.action === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {ev.action === 'buy' ? '▲' : '▼'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${ev.action === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                          {ev.action === 'buy' ? 'ENTRADA' : 'SALIDA'}
                        </span>
                        <span className="text-xs text-zinc-400">{ev.qty} MNQ</span>
                        <span className="text-xs text-zinc-500 ml-auto">{timeAgo(ev.created_at)}</span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {nyTime(ev.created_at)} NY · {ev.ticker}
                      </div>
                      {/* Status reenvío */}
                      {ev.forwarded && (
                        <div className={`text-xs mt-1 font-medium ${ev.forward_ok ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ev.forward_ok
                            ? '✓ TradersPost OK'
                            : `✗ TradersPost error ${ev.forward_status ?? ''}`}
                        </div>
                      )}
                      {!ev.forwarded && (
                        <div className="text-xs mt-1 text-zinc-600">sin reenvío configurado</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="px-4 py-2 border-t border-zinc-800 text-center">
            <a
              href="/alertas"
              className="text-xs text-zinc-400 hover:text-white transition"
            >
              Ver historial completo
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
