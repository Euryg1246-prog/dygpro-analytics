import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('trade_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { dia, fecha, hora, pullback_pts, signal, en_ventana, entro, outcome_pts, notas } = body

  const { data, error } = await supabase
    .from('trade_signals')
    .insert({ dia, fecha, hora, pullback_pts, signal, en_ventana, entro, outcome_pts: outcome_pts ?? null, notas: notas ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, outcome_pts, notas } = await req.json()

  const { data, error } = await supabase
    .from('trade_signals')
    .update({ outcome_pts, notas })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
