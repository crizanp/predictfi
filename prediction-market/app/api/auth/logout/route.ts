import { NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME, NONCE_COOKIE_NAME } from '../../../../lib/auth-session'

export async function POST() {
  const res = NextResponse.json({ success: true })

  const base = {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  }

  res.cookies.set(AUTH_COOKIE_NAME, '', base)
  res.cookies.set(NONCE_COOKIE_NAME, '', base)
  return res
}
