import crypto from 'node:crypto'

export type AuthAction = 'login' | 'signup'

export interface SessionUser {
  address: string
  username: string
}

interface TokenPayload {
  address: string
  username?: string
  nonce?: string
  action?: AuthAction
  iat: number
  exp: number
}

const SECRET = process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'predictwin-dev-secret-change-me'

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64')
}

function signData(data: string): string {
  return toBase64Url(crypto.createHmac('sha256', SECRET).update(data).digest())
}

export function signToken(payload: TokenPayload): string {
  const body = toBase64Url(JSON.stringify(payload))
  const signature = signData(body)
  return `${body}.${signature}`
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = signData(body)
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)

  if (expectedBuf.length !== signatureBuf.length) return null
  if (!crypto.timingSafeEqual(expectedBuf, signatureBuf)) return null

  try {
    const payload = JSON.parse(fromBase64Url(body).toString('utf8')) as TokenPayload
    if (!payload.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function isValidUsername(value: string): boolean {
  return /^[a-zA-Z0-9]{4,20}$/.test(value)
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase()
}

export function buildAuthMessage(address: string, nonce: string, action: AuthAction, issuedAt: number): string {
  const actionLabel = action === 'signup' ? 'Sign up' : 'Sign in'
  return [
    `predictwin ${actionLabel}`,
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAt).toISOString()}`,
    '',
    'This signature proves wallet ownership for authentication.'
  ].join('\n')
}

export const AUTH_COOKIE_NAME = 'pf_session'
export const NONCE_COOKIE_NAME = 'pf_auth_nonce'
