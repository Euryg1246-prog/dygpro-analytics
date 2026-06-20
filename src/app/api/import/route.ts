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

  // Insertar en batches de 50 capturando errores individuales
  let inserted = 0
  const errors: string[] = []
  const BATCH = 50

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('sessions')
      .upsert(batch, { onConflict: 'strategy,fecha,hora_baja' })
      .select()

    if (error) {
      errors.push(`batch ${i}-${i + BATCH}: ${error.message}`)
    } else {
      inserted += data?.length ?? 0
    }
  }

  const skipped = sessions.length - deduped.length
  return NextResponse.json({ imported: inserted, skipped, errors: errors.length > 0 ? errors : undefined })
}
