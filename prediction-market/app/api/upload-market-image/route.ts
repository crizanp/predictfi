import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const SUPABASE_PROJECT = 'nmaqfkqoeqkblcgqhffw'
const S3_ENDPOINT = `https://${SUPABASE_PROJECT}.supabase.co/storage/v1/s3`
const BUCKET = 'market-images'

const s3 = new S3Client({
  region: 'ap-southeast-1',
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID ?? '230d631a93fb5fe53bc9536d8d6dd808',
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY ?? 'dd8caea8ed1d35e6c5caa082cf438ecc37245a2e2777a7a442d09b5c57954e9b',
  },
  forcePathStyle: true,
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const marketId = formData.get('marketId') as string | null

    if (!file || !marketId) {
      return NextResponse.json({ error: 'Missing file or marketId' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const key = `market-${marketId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'image/jpeg',
      ACL: 'public-read',
    }))

    const publicUrl = `https://${SUPABASE_PROJECT}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`
    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
