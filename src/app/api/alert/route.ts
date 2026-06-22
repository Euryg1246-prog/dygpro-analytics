import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET — últimos 50 eventos para el badge y /alertas
export async function GET() {
  const { data, error } = await supabase
    .from('trade_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — recibe alerta (de TradingView, Make, o cualquier fuente) y la registra
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Auth: mismo secret que el resto de webhooks
  const secret = process.env.WEBHOOK_SECRET
  const authHeader = req.headers.get('authorization')
  const headerSecret = req.headers.get('x-webhook-secret')
  if (
    secret &&
    authHeader !== `Bearer ${secret}` &&
    headerSecret !== secret &&
    body.key !== secret
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ticker     = String(body.ticker     ?? 'MNQ1!')
  const action     = String(body.action     ?? 'unknown')
  const qty        = parseInt(String(body.quantity ?? body.qty ?? 1))
  const order_type = String(body.orderType  ?? 'market')

  const { error } = await supabase
    .from('trade_events')
    .insert({ ticker, action, qty, order_type, raw_json: body })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, event: { ticker, action, qty, order_type } })
}
