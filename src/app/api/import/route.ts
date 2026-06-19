import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { sessions } = await req.json()

  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return NextResponse.json({ error: 'No sessions provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sessions')
    .upsert(sessions, { onConflict: 'strategy,fecha' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: data?.length ?? 0 })
}
