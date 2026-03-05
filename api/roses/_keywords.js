const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of', 'in',
  'on', 'at', 'by', 'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'you', 'he', 'she', 'they', 'it', 'we', 'me', 'my', 'your', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'when', 'where', 'why', 'how', 'can',
  'could', 'should', 'would', 'do', 'does', 'did', 'will', 'just', 'really', 'very',
  'like', 'have', 'has', 'had', 'not', 'yes', 'no', 'about', 'into', 'than', 'who',
])

export function extractKeywords(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

export function addKeywordCounts(base = {}, text = '') {
  const next = { ...(base || {}) }
  const tokens = extractKeywords(text)
  tokens.forEach((token) => {
    next[token] = (next[token] || 0) + 1
  })
  return next
}

export function topKeywords(counts = {}, limit = 30) {
  return Object.entries(counts || {})
    .map(([word, count]) => ({ word, count: Number(count) || 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit)
}
