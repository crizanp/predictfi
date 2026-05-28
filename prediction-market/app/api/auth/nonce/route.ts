import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { buildAuthMessage, NONCE_COOKIE_NAME, normalizeAddress, signToken, type AuthAction } from '../../../../lib/auth-session'

const NONCE_TTL_MS = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') || ''
  const actionRaw = req.nextUrl.searchParams.get('action') || 'login'
  const action: AuthAction = actionRaw === 'signup' ? 'signup' : 'login'

  const normalized = normalizeAddress(address)
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  const nonce = randomUUID().replace(/-/g, '')
  const iat = Date.now()
  const exp = iat + NONCE_TTL_MS

  const nonceToken = signToken({
    address: normalized,
    nonce,
    action,
    iat,
    exp,
  })

  const message = buildAuthMessage(normalized, nonce, action, iat)
  const res = NextResponse.json({ message, expiresAt: exp })
  res.cookies.set(NONCE_COOKIE_NAME, nonceToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(NONCE_TTL_MS / 1000),
  })
  return res
}
