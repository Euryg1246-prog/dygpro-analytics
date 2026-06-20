import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function getTodayET(): { fecha: string; dia: string } {
  // NQ/MNQ sesiones en Eastern Time
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  const d = new Date(now)
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dia = DAYS_ES[d.getDay()]
  return { fecha, dia }
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/[+%]/g, ''))
  return isNaN(n) ? null : n
}

function authenticate(req: NextRequest, body: Record<string, unknown>): boolean {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return false
  // Acepta: header Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true
  // Acepta: header x-webhook-secret: <secret>
  if (req.headers.get('x-webhook-secret') === secret) return true
  // Acepta: body.key (compatibilidad hacia atrás)
  if (body.key === secret) return true
  return false
}

// GET — health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'DYGPRO Analytics Webhook',
    version: '2.0',
    auth: 'Bearer token via Authorization header or x-webhook-secret header',
    fields: {
      required: ['cierre'],
      optional: ['strategy', 'fecha', 'dia', 'open_price', 'baja', 'max_alta', 'hora_pico', 'hora_baja', 'min_pico', 'recuperacion', 'rec_pct', 'dev_max', 'mfe_mae', 'acumulado'],
    },
    note: 'fecha y dia se auto-generan con la fecha actual ET si no se envían',
  })
}

// POST — ingest de sesión
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!authenticate(req, body)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (body.cierre === undefined && body.cierre === null) {
    return NextResponse.json({ error: 'Campo requerido: cierre' }, { status: 422 })
  }

  const today = getTodayET()

  const session = {
    strategy: String(body.strategy || 'session_edge'),
    fecha: String(body.fecha || today.fecha),
    dia: String(body.dia || today.dia),
    open_price: parseNum(body.open ?? body.open_price),
    baja: parseNum(body.baja),
    cierre: parseNum(body.cierre),
    max_alta: parseNum(body.max_alta),
    hora_pico: body.hora_pico ? String(body.hora_pico) : null,
    hora_baja: body.hora_baja ? String(body.hora_baja) : null,
    min_pico: parseNum(body.min_pico),
    recuperacion: parseNum(body.recuperacion),
    rec_pct: parseNum(body.rec_pct),
    dev_max: parseNum(body.dev_max),
    mfe_mae: parseNum(body.mfe_mae),
    acumulado: parseNum(body.acumulado),
    source: 'webhook',
  }

  const { error } = await supabase
    .from('sessions')
    .upsert(session, { onConflict: 'strategy,fecha' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    saved: { strategy: session.strategy, fecha: session.fecha, dia: session.dia, cierre: session.cierre },
  })
}
