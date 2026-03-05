function readSecret(name) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function hasAny(...names) {
  return names.some((name) => Boolean(readSecret(name)))
}

export default async function handler(_req, res) {
  const openai = hasAny('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY')
  const anthropic = hasAny('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY')
  const elevenlabs = hasAny('ELEVENLABS_API_KEY', 'VITE_ELEVENLABS_API_KEY')

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({
    openai,
    anthropic,
    llmAny: openai || anthropic,
    elevenlabs,
  }))
}
