import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const day = params.get('day')
  const strategy = params.get('strategy') || 'session_edge'

  let query = supabase
    .from('sessions')
    .select('*')
    .order('fecha', { ascending: false })

  if (strategy !== 'all') query = query.eq('strategy', strategy)

  if (from) query = query.gte('fecha', from)
  if (to) query = query.lte('fecha', to)
  if (day) query = query.eq('dia', day)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
