import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { sessions } = await req.json()

  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return NextResponse.json({ error: 'No sessions provided' }, { status: 400 })
  }

  // Deduplicar por (strategy, fecha, hora_baja) — permite múltiples trades BK el mismo día
  const seen = new Set<string>()
  const deduped = sessions.filter((s: { strategy: string; fecha: string; hora_baja?: string }) => {
    const key = `${s.strategy}|${s.fecha}|${s.hora_baja ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const { data, error } = await supabase
    .from('sessions')
    .upsert(deduped, { onConflict: 'strategy,fecha,hora_baja' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const skipped = sessions.length - deduped.length
  return NextResponse.json({ imported: data?.length ?? 0, skipped })
}
