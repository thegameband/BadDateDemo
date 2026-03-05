import { getSingleResponseWithTimeout } from './llmService'

export const ROSES_FIELD_ORDER = [
  'name',
  'age',
  'pronouns',
  'occupation',
  'bio',
  'introTagline',
]

export const ROSES_FIELD_LIMITS = {
  name: 40,
  age: 3,
  pronouns: 30,
  occupation: 80,
  bio: 650,
  introTagline: 140,
}

const GENERATED_FIELD_STYLE = {
  name: {
    brief: 'Believable dating-profile name. Usually 1-3 words.',
    maxTokens: 48,
  },
  age: {
    brief: 'One integer age from 18 to 99.',
    maxTokens: 18,
  },
  pronouns: {
    brief: 'One pronoun set only (for example: she/her, he/they, they/them).',
    maxTokens: 28,
  },
  occupation: {
    brief: 'Short occupation phrase, usually 2-7 words.',
    maxTokens: 56,
  },
  bio: {
    brief: 'One or two short punchy sentences. Specific and characterful.',
    maxTokens: 180,
  },
  introTagline: {
    brief: 'One punchy opening line spoken aloud. Hooky, flirty, and memorable.',
    maxTokens: 70,
  },
}

function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizePunctuation(value = '') {
  return String(value)
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+\?/g, '?')
    .replace(/\s+!/g, '!')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const FIELD_LABEL_MAP = {
  name: ['name'],
  age: ['age'],
  pronouns: ['pronouns'],
  occupation: ['occupation', 'job'],
  bio: ['bio', 'biography', 'about'],
  introTagline: ['intro tagline', 'tagline', 'intro', 'opening line'],
}

function unwrapCodeFence(value = '') {
  const raw = String(value || '').trim()
  const fenced = raw.match(/^```[a-zA-Z0-9_-]*\n?([\s\S]*?)```$/)
  return fenced ? String(fenced[1] || '').trim() : raw
}

function stripFieldPrefix(field, value = '') {
  const aliases = FIELD_LABEL_MAP[field] || [field]
  const escaped = aliases
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  if (!escaped) return value
  const pattern = new RegExp(`^(?:${escaped})\\s*[:\\-]\\s*`, 'i')
  return String(value || '').replace(pattern, '').trim()
}

function normalizeGeneratedFieldText(field, rawValue = '') {
  let text = unwrapCodeFence(rawValue)

  text = text
    .replace(/^[-*]\s+/g, '')
    .replace(/^\d+[.)]\s+/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()

  text = stripFieldPrefix(field, text)

  if (field === 'introTagline') {
    text = text.replace(/^[-\s]+/, '')
  }

  return normalizePunctuation(normalizeWhitespace(text))
}

function normalizeGeneratedReplyText(rawValue = '') {
  const text = unwrapCodeFence(rawValue)
    .replace(/^[-*]\s+/g, '')
    .replace(/^\d+[.)]\s+/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^(?:answer|response)\s*[:-]\s*/i, '')
  return normalizePunctuation(normalizeWhitespace(text))
}

function toSingleSentence(value = '') {
  const text = normalizeWhitespace(value)
  if (!text) return ''

  const firstSentence = text.match(/[^.!?]+[.!?]/)?.[0]?.trim() || text
  if (!firstSentence) return ''
  if (/[.!?]$/.test(firstSentence)) return firstSentence
  return `${firstSentence}.`
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeGeneratedName(rawValue = '') {
  let text = String(rawValue || '')
    .split(/\r?\n/)[0]
    .trim()

  text = text
    .replace(/^\s*name\s*[:-]\s*/i, '')
    .replace(/\s*[,;|/]\s*\d{1,3}\b.*$/i, '')
    .replace(/\b(?:age|years?\s*old)\b.*$/i, '')
    .replace(/[0-9]/g, '')
    .replace(/[^\p{L}' -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = text.split(' ').filter(Boolean)
  if (words.length > 3) {
    return words.slice(0, 3).join(' ')
  }

  return text
}

function stripLeadingBioFieldEchoes(rawValue = '', fields = {}) {
  let text = normalizeWhitespace(rawValue)
  if (!text) return ''

  const age = Number.parseInt(String(fields?.age || ''), 10)
  if (Number.isFinite(age) && age >= 18) {
    const ageLeadPattern = new RegExp(`^${age}\\s*[,;:|\\-–—]\\s*`, 'i')
    text = text.replace(ageLeadPattern, '').trim()
  }

  const pronouns = normalizeWhitespace(fields?.pronouns || '')
  if (pronouns) {
    const pronounLeadPattern = new RegExp(`^${escapeRegExp(pronouns)}\\s*[,;:|\\-–—]\\s*`, 'i')
    text = text.replace(pronounLeadPattern, '').trim()
  }

  // Handle combos like "29, they/them — ..."
  if (Number.isFinite(age) && age >= 18 && pronouns) {
    const comboLeadPattern = new RegExp(`^${age}\\s*[,;:|\\-–—]\\s*${escapeRegExp(pronouns)}\\s*[,;:|\\-–—]\\s*`, 'i')
    text = text.replace(comboLeadPattern, '').trim()
  }

  return text.replace(/^[-–—,\s]+/, '').trim()
}

function bioEchoesProfileFields(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue).toLowerCase()
  if (!text) return false

  const age = Number.parseInt(String(fields?.age || ''), 10)
  if (Number.isFinite(age) && age >= 18) {
    const agePattern = new RegExp(`\\b${age}\\b`)
    if (agePattern.test(text)) return true
  }

  const pronouns = normalizeWhitespace(fields?.pronouns || '').toLowerCase()
  if (pronouns && text.includes(pronouns)) return true

  return false
}

function stripLeadingTaglineFieldEchoes(rawValue = '', fields = {}) {
  let text = normalizeWhitespace(rawValue)
  if (!text) return ''

  const age = Number.parseInt(String(fields?.age || ''), 10)
  const pronouns = normalizeWhitespace(fields?.pronouns || '')

  if (Number.isFinite(age) && age >= 18 && pronouns) {
    const comboLeadPattern = new RegExp(`^${age}\\s*[,;:|\\-–—]\\s*${escapeRegExp(pronouns)}\\s*[,;:|\\-–—]\\s*`, 'i')
    text = text.replace(comboLeadPattern, '').trim()
  }

  if (Number.isFinite(age) && age >= 18) {
    const ageLeadPattern = new RegExp(`^(?:i\\s*(?:am|'m)\\s*)?${age}\\s*[,;:|\\-–—]\\s*`, 'i')
    text = text.replace(ageLeadPattern, '').trim()
  }

  if (pronouns) {
    const pronounLeadPattern = new RegExp(`^${escapeRegExp(pronouns)}\\s*[,;:|\\-–—]\\s*`, 'i')
    text = text.replace(pronounLeadPattern, '').trim()
  }

  return text.replace(/^[-–—,\s]+/, '').trim()
}

function taglineEchoesProfileFields(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false
  const lower = text.toLowerCase()

  const age = Number.parseInt(String(fields?.age || ''), 10)
  if (Number.isFinite(age) && age >= 18) {
    const agePattern = new RegExp(`\\b${age}\\b`)
    if (agePattern.test(lower)) return true
    if (new RegExp(`^(?:i\\s*(?:am|'m)\\s*)?${age}\\b`, 'i').test(text)) return true
  }

  const pronouns = normalizeWhitespace(fields?.pronouns || '').toLowerCase()
  if (pronouns && lower.includes(pronouns)) return true

  const occupation = normalizeWhitespace(fields?.occupation || '').toLowerCase()
  if (occupation && occupation.length >= 4 && lower.includes(occupation)) return true

  if (/^(?:my name is|i am|i'm)\b/i.test(text)) return true
  return false
}

function taglineIsPunchyEnough(rawValue = '') {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false

  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 4 || words > 22) return false
  if (text.length > 110) return false

  const sentenceMarks = (text.match(/[.!?]/g) || []).length
  if (sentenceMarks > 1) return false
  if (/[;|]/.test(text)) return false
  if (/^\d/.test(text)) return false
  if (/^\s*(?:hey|hi|hello)\b[.!?]?$/i.test(text)) return false

  return true
}

const TAGLINE_OVERLAP_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'so', 'that', 'the', 'this', 'to', 'up', 'we',
  'with', 'you', 'your',
])

function tokenizeOverlapWords(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TAGLINE_OVERLAP_STOPWORDS.has(token))
}

function taglineLooksLikeProfileSummary(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false

  if (/\b(i\s*(?:am|'m)\s+(?:a|an)\b|work(?:ing)? as\b|based in\b|years?\s*old\b)/i.test(text)) {
    return true
  }

  const taglineTokens = tokenizeOverlapWords(text)
  if (taglineTokens.length < 5) return false

  const sourceText = normalizeWhitespace(`${fields?.occupation || ''} ${fields?.bio || ''}`)
  const sourceTokens = new Set(tokenizeOverlapWords(sourceText))
  if (!sourceTokens.size) return false

  const overlapCount = taglineTokens.filter((token) => sourceTokens.has(token)).length
  const overlapRatio = overlapCount / Math.max(1, taglineTokens.length)
  return overlapCount >= 4 || overlapRatio >= 0.5
}

const TAGLINE_RESCUE_FALLBACKS = [
  'Tell me your worst idea first.',
  'If you can make me laugh, I am already curious.',
  'Charm me fast, I do not do slow burns.',
  'Bring bold energy or bring snacks.',
  'Surprise me and I will match your chaos.',
]

function profileContext(fields = {}) {
  const lines = ROSES_FIELD_ORDER
    .map((key) => [key, normalizeWhitespace(fields?.[key] ?? '')])
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
  return lines.length ? lines.join('\n') : 'No fields filled yet.'
}

function cleanFieldValue(field, rawValue = '') {
  const cleaned = normalizeGeneratedFieldText(field, rawValue)

  if (field === 'name') {
    return normalizeGeneratedName(cleaned)
  }

  if (field === 'age') {
    const numeric = Number.parseInt(cleaned.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(numeric)) return ''
    return String(Math.max(18, Math.min(99, numeric)))
  }

  return cleaned
}

export function sanitizeRosesFields(input = {}) {
  const next = {}
  ROSES_FIELD_ORDER.forEach((field) => {
    next[field] = cleanFieldValue(field, input?.[field] ?? '')
  })
  return next
}

export async function generateRosesField(field, fields = {}) {
  if (!ROSES_FIELD_ORDER.includes(field)) return ''

  const style = GENERATED_FIELD_STYLE[field] || {}
  const context = profileContext(fields)
  const maxLength = ROSES_FIELD_LIMITS[field] || 120
  const currentValue = normalizeWhitespace(fields?.[field] ?? '')
  const variationNonce = Math.random().toString(36).slice(2, 10)

  const fieldRules = field === 'name'
    ? [
      'Name field rules: output only a person name.',
      'Name field rules: never include age, numbers, commas, parentheses, or descriptors.',
      'Name field rules: one to three words only.',
      'Name field rules: avoid placeholder defaults like Maya, Alex, Sam, or Jordan unless context explicitly requires one.',
    ]
    : field === 'bio'
      ? [
        'Bio field rules: never include explicit age numbers or pronoun sets.',
        'Bio field rules: do not list profile attributes like "29, they/them, ...".',
        'Bio field rules: write a vivid character blurb, not a profile-header restatement.',
      ]
      : field === 'introTagline'
        ? [
          'Intro Tagline rules: this is a spoken opener in chat, not a profile summary.',
          'Intro Tagline rules: one punchy sentence with a hook.',
          'Intro Tagline rules: no age, no pronouns, no occupation labels, no field-list fragments.',
          'Intro Tagline rules: no semicolon list structure and no resume-style phrasing.',
          'Intro Tagline rules: sound bold, playful, and enticing.',
        ]
    : []

  const basePrompt = [
    'You are writing exactly one field for a dating profile in a competitive social game.',
    'Return plain text only for that field value.',
    'No labels, no bullets, no markdown, and no surrounding quotes.',
    'Write naturally short and punchy like live dating-game copy.',
    'Be specific and believable. Avoid generic filler and cliches.',
    'Do not end mid-thought. Do not chop phrases.',
    '',
    `Target field: ${field}`,
    `Field brief: ${style.brief || 'Short, specific, and human.'}`,
    `Must fit within ${maxLength} characters.`,
    'For sentence fields: one concise sentence preferred, two short sentences max.',
    'Age must be an integer from 18 to 99.',
    ...(fieldRules.length ? [...fieldRules] : []),
    'Use the variation nonce only as an internal diversity cue. Never print it.',
    `Variation nonce: ${variationNonce}`,
    `Current value for this field: ${currentValue || '(empty)'}`,
    'If current value is non-empty, output a different value.',
    '',
    'Existing profile context:',
    context,
  ].join('\n')

  const requestFieldValue = async (prompt, maxTokens = style.maxTokens || 120) => {
    const generated = await getSingleResponseWithTimeout(prompt, { maxTokens, timeoutMs: 18000 })
    let value = cleanFieldValue(field, generated || '')
    if (field === 'bio') {
      value = stripLeadingBioFieldEchoes(value, fields)
    } else if (field === 'introTagline') {
      value = stripLeadingTaglineFieldEchoes(value, fields)
    }
    return value
  }

  const isWithinLimit = (value = '') => {
    if (!value) return false
    return String(value).length <= maxLength
  }

  const isDifferentFromCurrent = (value = '') => {
    if (!currentValue) return true
    return String(value || '').toLowerCase() !== currentValue.toLowerCase()
  }

  const passesFieldSpecificGuards = (value = '') => {
    if (field === 'bio') {
      return !bioEchoesProfileFields(value, fields)
    }
    if (field === 'introTagline') {
      return (
        !taglineEchoesProfileFields(value, fields) &&
        !taglineLooksLikeProfileSummary(value, fields) &&
        taglineIsPunchyEnough(value)
      )
    }
    return true
  }

  let candidate = await requestFieldValue(basePrompt)
  if (isWithinLimit(candidate) && isDifferentFromCurrent(candidate) && passesFieldSpecificGuards(candidate)) return candidate

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const rewritePrompt = [
      `Rewrite this ${field} field to be shorter without losing its personality.`,
      'Keep it natural, specific, and complete.',
      'No labels, no markdown, no quotes.',
      `Hard requirement: ${maxLength} characters or fewer.`,
      `Field brief: ${style.brief || 'Short, specific, and human.'}`,
      ...(fieldRules.length ? [...fieldRules] : []),
      `Current value for this field: ${currentValue || '(empty)'}`,
      'If current value is non-empty, output a different value.',
      ...(field === 'bio'
        ? ['Hard requirement for bio: do NOT include age numbers or pronoun text from the profile context.']
        : []),
      ...(field === 'introTagline'
        ? ['Hard requirement for introTagline: do NOT summarize profile facts; write a standalone opener line.']
        : []),
      '',
      'Current candidate:',
      candidate || '(empty)',
      '',
      'Output only the rewritten field value.',
    ].join('\n')

    candidate = await requestFieldValue(rewritePrompt, Math.max(48, Number(style.maxTokens || 120) - 28))
    if (isWithinLimit(candidate) && isDifferentFromCurrent(candidate) && passesFieldSpecificGuards(candidate)) return candidate
  }

  if (field === 'introTagline') {
    const rescuePrompt = [
      'Rewrite this into a standalone opening line someone would say in live chat.',
      'One sentence. Punchy. Hooky. Slightly playful.',
      'Do NOT summarize profile facts.',
      'Do NOT include age, pronouns, occupation labels, or biography details.',
      'No semicolons. No list structure.',
      '',
      'Current candidate:',
      candidate || '(empty)',
      '',
      'Return only the rewritten line.',
    ].join('\n')

    candidate = await requestFieldValue(rescuePrompt, 64)
    if (isWithinLimit(candidate) && isDifferentFromCurrent(candidate) && passesFieldSpecificGuards(candidate)) return candidate

    const fallback = TAGLINE_RESCUE_FALLBACKS[Math.floor(Math.random() * TAGLINE_RESCUE_FALLBACKS.length)]
    if (isDifferentFromCurrent(fallback) && passesFieldSpecificGuards(fallback)) return fallback
  }

  return ''
}

function simpleFallbackReply(profile, question) {
  const occupation = normalizeWhitespace(profile?.fields?.occupation)

  const compactQuestion = normalizeWhitespace(question).toLowerCase()
  if (compactQuestion.includes('hobby') || compactQuestion.includes('free time')) {
    return 'I am usually chasing something active, creative, or a little chaotic.'
  }

  if (compactQuestion.includes('work') || compactQuestion.includes('job')) {
    return occupation
      ? `I work as ${occupation}, and it definitely shaped how I show up in relationships.`
      : 'I care a lot about ambition, but I am not trying to turn life into a spreadsheet.'
  }

  return 'I like direct questions. I care about chemistry, honesty, and someone who can keep up.'
}

export async function generateRosesReply({ profile, question, priorTurns = [] }) {
  const context = [
    `Name: ${profile?.fields?.name || 'Unknown'}`,
    `Age: ${profile?.fields?.age || ''}`,
    `Pronouns: ${profile?.fields?.pronouns || ''}`,
    `Occupation: ${profile?.fields?.occupation || ''}`,
    `Bio: ${profile?.fields?.bio || ''}`,
    `Intro Tagline: ${profile?.fields?.introTagline || ''}`,
  ].join('\n')

  const transcript = (Array.isArray(priorTurns) ? priorTurns : [])
    .slice(-3)
    .map((turn, idx) => `Q${idx + 1}: ${normalizeWhitespace(turn.question)}\nA${idx + 1}: ${normalizeWhitespace(turn.response)}`)
    .join('\n') || 'No prior turns.'

  const prompt = [
    'You are roleplaying a dating profile in a rose-ceremony game.',
    'Answer as this profile would answer in live chat.',
    'Core objective: preserve character voice and persona specificity over being generally polite or safe.',
    'Rules:',
    '- Exactly one sentence.',
    '- Keep it succinct, punchy, and information-dense.',
    '- Usually 9-20 words.',
    '- Voice-first: wording, rhythm, confidence, and attitude should clearly match this specific profile.',
    '- Do NOT flatten into generic dating-app friendliness.',
    '- If this profile is heightened, theatrical, iconic, or over-the-top, lean fully into that persona.',
    '- Include at least one concrete, profile-consistent detail, value, or behavioral tell when possible.',
    '- Punchy, specific, and honest.',
    '- No stage directions, no asterisks, no emojis, no bullet points.',
    '- No generic therapy-speak or vague filler.',
    '- No bland neutral openers like "That is a good question" or "I like that."',
    '- Do not quote the profile fields verbatim; express them naturally in-character.',
    '',
    'Wrong style example:',
    '- "I value honesty and communication, and I would like to get to know you better."',
    'Right style example:',
    '- "If your idea of romance includes chaos and snacks, we are already halfway there."',
    '',
    'Profile:',
    context,
    '',
    'Recent transcript:',
    transcript,
    '',
    `Bachelor question: ${normalizeWhitespace(question)}`,
    '',
    'Return only the answer text.',
  ].join('\n')

  const generated = await getSingleResponseWithTimeout(prompt, { maxTokens: 120, timeoutMs: 18000 })
  const cleaned = normalizeGeneratedReplyText(generated || '')
  if (!cleaned) return toSingleSentence(simpleFallbackReply(profile, question))
  return toSingleSentence(cleaned)
}
