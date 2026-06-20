import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const secret = process.env.SITE_PASSWORD

  if (!secret) {
    // Sin SITE_PASSWORD configurado: acceso libre
    return NextResponse.json({ ok: true })
  }

  if (password.trim() !== secret.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('dygpro_auth', secret, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 días
    path: '/',
  })
  return res
}
