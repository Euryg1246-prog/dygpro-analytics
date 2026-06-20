import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const day = params.get('day')
  const strategy = params.get('strategy') || 'session_edge'

  const PAGE = 1000
  let allData: unknown[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('sessions')
      .select('*')
      .order('fecha', { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (strategy !== 'all') query = query.eq('strategy', strategy)
    if (from) query = query.gte('fecha', from)
    if (to) query = query.lte('fecha', to)
    if (day) query = query.eq('dia', day)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break

    allData = allData.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  return NextResponse.json(allData)
}
