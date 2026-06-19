import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.key !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session = {
    strategy: body.strategy || 'session_edge',
    fecha: body.fecha,
    dia: body.dia,
    open_price: body.open,
    baja: body.baja,
    cierre: body.cierre,
    max_alta: body.max_alta,
    hora_pico: body.hora_pico,
    hora_baja: body.hora_baja,
    min_pico: body.min_pico,
    recuperacion: body.recuperacion,
    rec_pct: body.rec_pct,
    dev_max: body.dev_max,
    mfe_mae: body.mfe_mae,
    acumulado: body.acumulado,
    source: 'webhook',
  }

  const { error } = await supabase
    .from('sessions')
    .upsert(session, { onConflict: 'strategy,fecha' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
