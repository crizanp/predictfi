import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const S3_ENDPOINT = process.env.SUPABASE_S3_ENDPOINT ?? `${SUPABASE_URL}/storage/v1/s3`
const S3_ACCESS_KEY = process.env.SUPABASE_S3_ACCESS_KEY_ID ?? ''
const S3_SECRET_KEY = process.env.SUPABASE_S3_SECRET_ACCESS_KEY ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BUCKET = 'market-images'

function getPublicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`
}

async function uploadToLocalPublic(key: string, buffer: Buffer): Promise<string> {
  const dir = path.join(process.cwd(), 'public', BUCKET)
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, key)
  await writeFile(filePath, buffer)
  return `/${BUCKET}/${key}`
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const marketId = formData.get('marketId') as string | null

    if (!file || !marketId) {
      return NextResponse.json({ error: 'Missing file or marketId' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    const maxBytes = 5 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
    }

    const safeMarketId = marketId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown'
    const extRaw = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const ext = /^[a-z0-9]{1,8}$/.test(extRaw) ? extRaw : 'jpg'
    const key = `market-${safeMarketId}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    if (S3_ACCESS_KEY && S3_SECRET_KEY) {
      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: S3_ENDPOINT,
          credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
          forcePathStyle: true,
        })

        try {
          await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
        } catch {
          // Bucket already exists or caller cannot create it; upload may still succeed.
        }

        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: buffer,
          ContentType: file.type || 'image/jpeg',
        }))

        return NextResponse.json({ url: getPublicUrl(key) })
      } catch {
        // Fall through to Supabase client upload or local fallback.
      }
    }

    const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
    if (SUPABASE_URL && supabaseKey) {
      const supabase = createClient(SUPABASE_URL, supabaseKey)

      if (SUPABASE_SERVICE_ROLE_KEY) {
        const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
          public: true,
          fileSizeLimit: `${maxBytes}`,
        })
        if (createErr && !/already exists/i.test(createErr.message)) {
          // Ignore and continue; bucket may still be available.
        }
      }

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, buffer, { contentType: file.type || 'image/jpeg', upsert: true })

      if (!uploadErr) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
        return NextResponse.json({ url: data.publicUrl || getPublicUrl(key) })
      }
    }

    const localUrl = await uploadToLocalPublic(key, buffer)
    return NextResponse.json({ url: localUrl, storage: 'local-fallback' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

