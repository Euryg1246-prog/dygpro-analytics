'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const EXAMPLE_PAYLOAD = {
  strategy: 'session_edge',
  cierre: 125,
  baja: -30,
  max_alta: 180,
  hora_pico: '10:30',
  hora_baja: '09:15',
  mfe_mae: 6.0,
}

const TRADINGVIEW_EXAMPLE = `{
  "strategy": "session_edge",
  "cierre": {{strategy.order.price}},
  "baja": {{plot("Baja")}},
  "max_alta": {{plot("Max Alta")}},
  "hora_pico": "{{timenow}}"
}`

export default function WebhookPage() {
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState(JSON.stringify(EXAMPLE_PAYLOAD, null, 2))

  const testWebhook = async () => {
    setLoading(true)
    setResult(null)
    try {
      const parsed = JSON.parse(payload)
      const secret = prompt('Ingresa tu WEBHOOK_SECRET para probar:')
      if (!secret) { setLoading(false); return }

      const res = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': secret,
        },
        body: JSON.stringify(parsed),
      })
      const data = await res.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (e) {
      setResult('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
    setLoading(false)
  }

  const checkHealth = async () => {
    setLoading(true)
    const res = await fetch('/api/webhook')
    const data = await res.json()
    setResult(JSON.stringify(data, null, 2))
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Webhook — Auto Import</h1>
      <p className="text-zinc-400 text-sm">
        Envía sesiones directamente desde TradingView, scripts Python, o cualquier herramienta.
      </p>

      {/* Endpoint */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base">Endpoint</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded text-xs font-mono">POST</span>
            <code className="text-zinc-300">https://analytics.dygpro.com/api/webhook</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-blue-900 text-blue-300 px-2 py-0.5 rounded text-xs font-mono">GET</span>
            <code className="text-zinc-300">https://analytics.dygpro.com/api/webhook</code>
            <span className="text-zinc-500 text-xs">health check</span>
          </div>
        </CardContent>
      </Card>

      {/* Auth */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base">Autenticación</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          <p>Agrega uno de estos headers:</p>
          <pre className="bg-zinc-800 rounded p-3 text-xs overflow-x-auto">{`Authorization: Bearer dygpro_webhook_2026
# o
x-webhook-secret: dygpro_webhook_2026`}</pre>
        </CardContent>
      </Card>

      {/* Campos */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base">Campos</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1.5 pr-4">Campo</th>
                <th className="text-left py-1.5 pr-4">Tipo</th>
                <th className="text-left py-1.5">Descripción</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {[
                ['cierre', 'number', 'PnL final de la sesión (requerido)'],
                ['strategy', 'string', 'session_edge | breakout_v4 | open_below_80'],
                ['fecha', 'string', 'YYYY-MM-DD — se auto-genera si no se envía (ET)'],
                ['dia', 'string', 'Dom | Lun | Mar — se auto-genera si no se envía'],
                ['open_price', 'number', 'Precio de apertura'],
                ['baja', 'number', 'Puntos de baja máxima'],
                ['max_alta', 'number', 'Puntos de alta máxima'],
                ['hora_pico', 'string', 'HH:MM del pico'],
                ['hora_baja', 'string', 'HH:MM de la baja'],
                ['mfe_mae', 'number', 'Ratio MFE/MAE'],
                ['min_pico', 'number', 'Minutos al pico'],
                ['recuperacion', 'number', 'Puntos de recuperación'],
                ['rec_pct', 'number', '% de recuperación'],
                ['dev_max', 'number', 'Devolución máxima'],
                ['acumulado', 'number', 'PnL acumulado total'],
              ].map(([campo, tipo, desc]) => (
                <tr key={campo} className="border-b border-zinc-800/50">
                  <td className="py-1.5 pr-4 font-mono text-emerald-400">{campo}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{tipo}</td>
                  <td className="py-1.5">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* TradingView */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base">Ejemplo TradingView Alert</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-zinc-400 text-xs">En TradingView → Alert → Message:</p>
          <pre className="bg-zinc-800 rounded p-3 text-xs overflow-x-auto text-zinc-300">{TRADINGVIEW_EXAMPLE}</pre>
          <p className="text-zinc-400 text-xs">
            Webhook URL: <code className="text-zinc-300">https://analytics.dygpro.com/api/webhook</code><br />
            Header: <code className="text-zinc-300">x-webhook-secret: dygpro_webhook_2026</code>
          </p>
        </CardContent>
      </Card>

      {/* Test */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base">Probar webhook</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={payload}
            onChange={e => setPayload(e.target.value)}
            rows={10}
            className="w-full bg-zinc-800 border border-zinc-700 rounded p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-500"
          />
          <div className="flex gap-3">
            <Button onClick={testWebhook} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-sm">
              {loading ? 'Enviando...' : 'Enviar POST'}
            </Button>
            <Button onClick={checkHealth} disabled={loading} variant="outline" className="text-sm border-zinc-700">
              Health Check
            </Button>
          </div>
          {result && (
            <pre className="bg-zinc-800 rounded p-3 text-xs text-zinc-300 overflow-x-auto">{result}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
