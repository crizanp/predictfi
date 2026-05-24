import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
// Prefer service-role key for server-side uploads; fall back to anon key
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const BUCKET = 'market-images'

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, { public: true })
    if (bucketErr && !bucketErr.message.toLowerCase().includes('already exists')) {
      console.warn('Bucket create attempt:', bucketErr.message)
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const marketId = formData.get('marketId') as string | null

    if (!file || !marketId) {
      return NextResponse.json({ error: 'Missing file or marketId' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const key = `market-${marketId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
    return NextResponse.json({ url: data.publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
