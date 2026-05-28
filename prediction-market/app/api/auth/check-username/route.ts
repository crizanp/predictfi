import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidUsername } from '../../../../lib/auth-session'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get('username') || '').trim()

  if (!isValidUsername(username)) {
    return NextResponse.json({ available: false, reason: 'Username must be 4-20 letters or numbers only.' }, { status: 400 })
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ available: true, warning: 'Supabase not configured. Uniqueness cannot be guaranteed.' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data, error } = await supabase
    .from('user_profiles')
    .select('wallet_address, display_name')
    .ilike('display_name', username)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ available: false, reason: error.message }, { status: 500 })
  }

  return NextResponse.json({ available: !data })
}
