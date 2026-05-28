import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME, verifyToken } from '../../../../lib/auth-session'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ user: null })
  }

  const payload = verifyToken(token)
  if (!payload?.address || !payload.username) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({
    user: {
      address: payload.address,
      username: payload.username,
    },
  })
}
