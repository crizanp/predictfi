import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const S3_ENDPOINT = process.env.SUPABASE_S3_ENDPOINT ?? `${SUPABASE_URL}/storage/v1/s3`
const S3_ACCESS_KEY = process.env.SUPABASE_S3_ACCESS_KEY_ID ?? ''
const S3_SECRET_KEY = process.env.SUPABASE_S3_SECRET_ACCESS_KEY ?? ''
const BUCKET = 'market-images'

function getPublicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`
}

export async function POST(req: NextRequest) {
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
    return NextResponse.json({ error: 'S3 credentials not configured' }, { status: 500 })
  }

  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: true,
    })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const marketId = formData.get('marketId') as string | null

    if (!file || !marketId) {
      return NextResponse.json({ error: 'Missing file or marketId' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const key = `market-${marketId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // Try to create bucket; ignore "already exists" errors
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    } catch { /* bucket likely exists */ }

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'image/jpeg',
    }))

    return NextResponse.json({ url: getPublicUrl(key) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

