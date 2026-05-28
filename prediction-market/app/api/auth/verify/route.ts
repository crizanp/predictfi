import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ethers } from 'ethers'
import {
  AUTH_COOKIE_NAME,
  NONCE_COOKIE_NAME,
  buildAuthMessage,
  isValidUsername,
  normalizeAddress,
  signToken,
  verifyToken,
  type AuthAction,
} from '../../../../lib/auth-session'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

interface VerifyBody {
  address?: string
  signature?: string
  action?: AuthAction
  username?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as VerifyBody
  const address = normalizeAddress(body.address || '')
  const signature = (body.signature || '').trim()
  const action: AuthAction = body.action === 'signup' ? 'signup' : 'login'
  const username = (body.username || '').trim()

  if (!/^0x[a-f0-9]{40}$/.test(address) || !signature) {
    return NextResponse.json({ error: 'Invalid auth payload' }, { status: 400 })
  }

  const nonceToken = req.cookies.get(NONCE_COOKIE_NAME)?.value
  if (!nonceToken) {
    return NextResponse.json({ error: 'Missing nonce session. Try again.' }, { status: 401 })
  }

  const noncePayload = verifyToken(nonceToken)
  if (!noncePayload?.nonce || !noncePayload.action || !noncePayload.iat || !noncePayload.address) {
    return NextResponse.json({ error: 'Invalid or expired nonce session.' }, { status: 401 })
  }

  if (noncePayload.address !== address || noncePayload.action !== action) {
    return NextResponse.json({ error: 'Nonce does not match this request.' }, { status: 401 })
  }

  const message = buildAuthMessage(address, noncePayload.nonce, action, noncePayload.iat)
  const recovered = ethers.verifyMessage(message, signature).toLowerCase()
  if (recovered !== address) {
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 401 })
  }

  let finalUsername = username

  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    if (action === 'signup') {
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: 'Username must be 4-20 letters or numbers only.' }, { status: 400 })
      }

      const { data: existingByName } = await supabase
        .from('user_profiles')
        .select('wallet_address, display_name')
        .ilike('display_name', username)
        .maybeSingle()

      if (existingByName && String(existingByName.wallet_address).toLowerCase() !== address) {
        return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 })
      }

      const { error: upsertErr } = await supabase.from('user_profiles').upsert(
        {
          wallet_address: address,
          display_name: username,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'wallet_address' }
      )

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 })
      }
    } else {
      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('wallet_address', address)
        .maybeSingle()

      if (profileErr) {
        return NextResponse.json({ error: profileErr.message }, { status: 500 })
      }
      if (!profile?.display_name) {
        return NextResponse.json({ error: 'No account found for this wallet. Please sign up first.' }, { status: 404 })
      }
      finalUsername = String(profile.display_name)
    }
  } else {
    if (action === 'signup') {
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: 'Username must be 4-20 letters or numbers only.' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Login requires Supabase profile data to be configured.' }, { status: 500 })
    }
  }

  const now = Date.now()
  const exp = now + SESSION_TTL_MS
  const sessionToken = signToken({
    address,
    username: finalUsername,
    iat: now,
    exp,
  })

  const res = NextResponse.json({
    user: {
      address,
      username: finalUsername,
    },
  })

  res.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  res.cookies.set(NONCE_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return res
}
