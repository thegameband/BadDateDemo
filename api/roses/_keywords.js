const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of', 'in',
  'on', 'at', 'by', 'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'you', 'he', 'she', 'they', 'it', 'we', 'me', 'my', 'your', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'when', 'where', 'why', 'how', 'can',
  'could', 'should', 'would', 'do', 'does', 'did', 'will', 'just', 'really', 'very',
  'like', 'have', 'has', 'had', 'not', 'yes', 'no', 'about', 'into', 'than', 'who',
])

function shouldIgnoreToken(token = '', ignoreWords) {
  if (!ignoreWords) return false
  if (ignoreWords instanceof Set) return ignoreWords.has(token)
  if (Array.isArray(ignoreWords)) return ignoreWords.includes(token)
  return false
}

export function extractKeywords(text = '', options = {}) {
  const ignoreWords = options?.ignoreWords
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !shouldIgnoreToken(token, ignoreWords))
}

export function addKeywordCounts(base = {}, text = '', options = {}) {
  const next = { ...(base || {}) }
  const tokens = extractKeywords(text, options)
  tokens.forEach((token) => {
    next[token] = (next[token] || 0) + 1
  })
  return next
}

export function topKeywords(counts = {}, limit = 30, options = {}) {
  const ignoreWords = options?.ignoreWords
  return Object.entries(counts || {})
    .map(([word, count]) => ({ word, count: Number(count) || 0 }))
    .filter((item) => item.count > 0 && !shouldIgnoreToken(item.word, ignoreWords))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit)
}
