import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let _vercelKv = undefined
let _redisClient = undefined
const LOCAL_STORE_FILE = path.join(os.tmpdir(), 'bad-date-roses-kv-v1.json')
let _fileStoreQueue = Promise.resolve()
const REDIS_URL_ENV_KEYS = ['REDIS_URL', 'UPSTASH_REDIS_URL', 'STORAGE_URL']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function findTopLevelJsonObjectEnd(raw = '') {
  let inString = false
  let escaped = false
  let depth = 0
  let started = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]

    if (!started) {
      if (ch === '{') {
        started = true
        depth = 1
      }
      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }

  return -1
}

function parseStorePayload(raw = '') {
  try {
    const parsed = JSON.parse(raw)
    if (isPlainObject(parsed)) return { store: parsed, recovered: false }
    return { store: {}, recovered: false }
  } catch {
    const jsonEnd = findTopLevelJsonObjectEnd(raw)
    if (jsonEnd <= 0) return null

    try {
      const recoveredRaw = raw.slice(0, jsonEnd)
      const recovered = JSON.parse(recoveredRaw)
      if (!isPlainObject(recovered)) return { store: {}, recovered: true }
      return { store: recovered, recovered: true }
    } catch {
      return null
    }
  }
}

function withFileStoreLock(task) {
  const run = _fileStoreQueue.then(() => task())
  _fileStoreQueue = run.catch(() => {})
  return run
}

function hasVercelKvEnv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

function getRedisUrl() {
  for (const key of REDIS_URL_ENV_KEYS) {
    const value = String(process.env[key] || '').trim()
    if (value) return value
  }
  return ''
}

function hasRedisUrl() {
  return Boolean(getRedisUrl())
}

function requiresDurableStorage() {
  // Vercel instances are ephemeral; local filesystem/memory fallback is unsafe there.
  return Boolean(process.env.VERCEL)
}

function throwDurableStorageUnavailable(op) {
  const details = [
    hasVercelKvEnv() ? 'kv-env:present' : 'kv-env:missing',
    hasRedisUrl() ? 'redis-url:present' : 'redis-url:missing',
    `redis-url-key:${REDIS_URL_ENV_KEYS.find((key) => Boolean(process.env[key])) || 'none'}`,
  ].join(', ')
  const error = new Error(
    `Roses storage unavailable during ${op}. Configure Redis/KV for Vercel (${details}).`
  )
  error.code = 'ROSES_STORAGE_UNAVAILABLE'
  throw error
}

function getMemoryStore() {
  const g = globalThis
  if (!g.__ROSES_MEM_KV__) {
    g.__ROSES_MEM_KV__ = new Map()
  }
  return g.__ROSES_MEM_KV__
}

async function readLocalFileStore() {
  try {
    const raw = await fs.readFile(LOCAL_STORE_FILE, 'utf8')
    const parsedResult = parseStorePayload(raw)
    if (parsedResult) {
      if (parsedResult.recovered) {
        console.warn('Roses storage: recovered malformed local store JSON.')
        await writeLocalFileStore(parsedResult.store)
      }
      return parsedResult.store
    }
    return {}
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    console.warn('Roses storage: local file read failed, using empty store.', error)
    return {}
  }
}

async function writeLocalFileStore(storeObj) {
  const tempFile = `${LOCAL_STORE_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await fs.writeFile(tempFile, JSON.stringify(storeObj), 'utf8')
    await fs.rename(tempFile, LOCAL_STORE_FILE)
    return true
  } catch (error) {
    console.warn('Roses storage: local file write failed, memory fallback.', error)
    return false
  } finally {
    // Clean up in case a temp file was left behind after a failed rename/write.
    try {
      await fs.unlink(tempFile)
    } catch {
      // Ignore cleanup failures.
    }
  }
}

async function getLocalFileEntry(key) {
  return withFileStoreLock(async () => {
    const storeObj = await readLocalFileStore()
    const entry = storeObj[key]
    if (!entry) return null

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      delete storeObj[key]
      await writeLocalFileStore(storeObj)
      return null
    }

    return entry
  })
}

async function setLocalFileEntry(key, entry) {
  return withFileStoreLock(async () => {
    const storeObj = await readLocalFileStore()
    storeObj[key] = entry
    return writeLocalFileStore(storeObj)
  })
}

async function getVercelKv() {
  if (_vercelKv !== undefined) return _vercelKv
  if (!hasVercelKvEnv()) {
    _vercelKv = null
    return _vercelKv
  }

  try {
    const mod = await import('@vercel/kv')
    _vercelKv = mod?.kv || null
  } catch (error) {
    console.warn('Roses storage: @vercel/kv unavailable, falling back.', error)
    _vercelKv = null
  }
  return _vercelKv
}

async function getRedisClient() {
  if (_redisClient !== undefined) return _redisClient
  if (!hasRedisUrl()) {
    _redisClient = null
    return _redisClient
  }

  try {
    const redis = await import('redis')
    const client = redis.createClient({ url: getRedisUrl() })
    client.on('error', (error) => {
      console.error('Roses Redis error:', error)
    })
    await client.connect()
    _redisClient = client
  } catch (error) {
    console.warn('Roses storage: redis unavailable, falling back.', error)
    _redisClient = null
  }

  return _redisClient
}

export async function kvGetJSON(key) {
  const vercelKv = await getVercelKv()
  if (vercelKv) {
    const raw = await vercelKv.get(key)
    if (raw == null) return null
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    }
    return raw
  }

  const redis = await getRedisClient()
  if (redis) {
    try {
      const raw = await redis.get(key)
      if (!raw) return null
      return JSON.parse(raw)
    } catch (error) {
      console.warn('Roses storage: redis read failed, memory fallback.', error)
    }
  }

  if (requiresDurableStorage()) {
    throwDurableStorageUnavailable('kvGetJSON')
  }

  const fileEntry = await getLocalFileEntry(key)
  if (fileEntry) {
    try {
      return JSON.parse(fileEntry.value)
    } catch {
      return null
    }
  }

  const store = getMemoryStore()
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }

  try {
    return JSON.parse(entry.value)
  } catch {
    return null
  }
}

export async function kvSetJSON(key, value, options = {}) {
  const raw = JSON.stringify(value)

  const vercelKv = await getVercelKv()
  if (vercelKv) {
    if (options.exSeconds) {
      await vercelKv.set(key, raw, { ex: options.exSeconds })
    } else {
      await vercelKv.set(key, raw)
    }
    return
  }

  const redis = await getRedisClient()
  if (redis) {
    try {
      if (options.exSeconds) {
        await redis.set(key, raw, { EX: options.exSeconds })
      } else {
        await redis.set(key, raw)
      }
      return
    } catch (error) {
      console.warn('Roses storage: redis write failed, memory fallback.', error)
    }
  }

  if (requiresDurableStorage()) {
    throwDurableStorageUnavailable('kvSetJSON')
  }

  const expiresAt = typeof options.exSeconds === 'number'
    ? Date.now() + (options.exSeconds * 1000)
    : undefined
  const entry = { value: raw, expiresAt }

  const wroteFile = await setLocalFileEntry(key, entry)
  if (wroteFile) return

  const store = getMemoryStore()
  store.set(key, entry)
}
