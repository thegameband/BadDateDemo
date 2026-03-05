const DEFAULT_CAPABILITIES = Object.freeze({
  loaded: false,
  openai: false,
  anthropic: false,
  llmAny: false,
  elevenlabs: false,
})

const CACHE_TTL_MS = 60_000

let cachedCapabilities = { ...DEFAULT_CAPABILITIES }
let cachedAt = 0
let pendingCapabilitiesRequest = null

function normalizeCapabilities(payload = {}) {
  const openai = Boolean(payload?.openai)
  const anthropic = Boolean(payload?.anthropic)
  const llmAny = Boolean(payload?.llmAny ?? (openai || anthropic))
  const elevenlabs = Boolean(payload?.elevenlabs)

  return {
    loaded: true,
    openai,
    anthropic,
    llmAny,
    elevenlabs,
  }
}

export function getCachedRuntimeCapabilities() {
  return { ...cachedCapabilities }
}

export async function fetchRuntimeCapabilities(options = {}) {
  const force = Boolean(options?.force)
  const age = Date.now() - cachedAt

  if (!force && cachedCapabilities.loaded && age < CACHE_TTL_MS) {
    return getCachedRuntimeCapabilities()
  }

  if (!force && pendingCapabilitiesRequest) {
    return pendingCapabilitiesRequest
  }

  pendingCapabilitiesRequest = (async () => {
    try {
      const response = await fetch('/api/config/capabilities', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Capabilities request failed (${response.status})`)
      }

      const payload = await response.json()
      cachedCapabilities = normalizeCapabilities(payload)
      cachedAt = Date.now()
      return getCachedRuntimeCapabilities()
    } catch {
      return getCachedRuntimeCapabilities()
    } finally {
      pendingCapabilitiesRequest = null
    }
  })()

  return pendingCapabilitiesRequest
}
