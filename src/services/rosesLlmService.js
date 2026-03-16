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
    brief: 'One or two short sentences written from inside the character. Distinctive, biased, and specific.',
    maxTokens: 180,
  },
  introTagline: {
    brief: 'One spoken line the character would actually say out loud on first contact. Memorable and character-authored.',
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

const BIO_STYLE_MODES = [
  {
    name: 'boast',
    instruction: 'Let them brag shamelessly about what makes them impressive, dangerous, elite, or impossible to ignore.',
  },
  {
    name: 'grievance',
    instruction: 'Let them complain, sneer, or hold a grudge. Pettiness and irritation are good if they fit the character.',
  },
  {
    name: 'manifesto',
    instruction: 'Make it feel like a mission statement, creed, or warped philosophy rather than a friendly profile.',
  },
  {
    name: 'obsession',
    instruction: 'Center the bio on the thing they are fixated on. Let the fixation dominate the voice.',
  },
  {
    name: 'threat',
    instruction: 'Lean into menace, intimidation, or danger if the character invites it. Controlled hostility is allowed.',
  },
  {
    name: 'confession',
    instruction: 'Make it sound like a revealing admission, self-own, or unnerving truth rather than polished charm.',
  },
]

const BIO_GENERIC_PATTERNS = [
  /\bif you can keep up\b/i,
  /\bkeep up with my\b/i,
  /\bdry humor\b/i,
  /\bsurprisingly domestic\b/i,
  /\bdomestic streak\b/i,
  /\bpartner in crime\b/i,
  /\bbonus points if\b/i,
  /\bswipe right\b/i,
  /\blooking for\b/i,
  /\bmake me laugh\b/i,
  /\blast dumpling\b/i,
  /\bmean noodles?\b/i,
  /\bwicked sense of humor\b/i,
  /\bsecret soft(?:ie| spot)\b/i,
  /\bcan you handle\b/i,
  /\bhandle my\b/i,
]

const BIO_UNPROMPTED_DOMESTICITY_PATTERN = /\b(?:cook|cooks|cooking|chef|kitchen|bake|baking|dumplings?|noodles?|pasta|brunch|snacks?|coffee|tea|wine|domestic|cozy|cuddle|soft spot)\b/i
const BIO_DOMESTICITY_CONTEXT_PATTERN = /\b(?:cook|chef|kitchen|bak(?:e|ing|er|ery)|food|restaurant|barista|tea|coffee|wine|domestic|cozy|farmer|gardener)\b/i
const BIO_VOICE_MARKER_PATTERN = /\b(?:i|me|my)\b/i
const BIO_EXTREME_WORD_PATTERN = /\b(?:collect|collected|built|ruined|conquered|hunt|hunted|command|despise|adore|obsessed|worship|devour|stole|survived|destroy|haunt|win|victory|trophy|grudge|empire|chaos)\b/i

const TAGLINE_STYLE_MODES = [
  {
    name: 'command',
    instruction: 'Make it a command, order, or drill-sergeant line if that fits the character.',
  },
  {
    name: 'warning',
    instruction: 'Make it a threat, warning, or line in the sand if the character has danger in them.',
  },
  {
    name: 'boast',
    instruction: 'Make it a flex, challenge, or declaration of superiority.',
  },
  {
    name: 'credo',
    instruction: 'Make it sound like a personal rule, worldview, or hard principle.',
  },
  {
    name: 'dare',
    instruction: 'Make it a pointed dare or challenge that invites response without turning cutesy.',
  },
  {
    name: 'invitation',
    instruction: 'Make it an invitation only if the character would naturally talk that way. Keep it specific, not generic flirt copy.',
  },
]

const TAGLINE_GENERIC_PATTERNS = [
  /\bstep closer\b/i,
  /\bwinner gets\b/i,
  /\bloser gets\b/i,
  /\bwicked grin\b/i,
  /\bmake me laugh\b/i,
  /\bslow burns?\b/i,
  /\bbold energy\b/i,
  /\bbring snacks\b/i,
  /\bmatch your chaos\b/i,
  /\bworst idea first\b/i,
  /\bsurprise me\b/i,
  /\bcharm me fast\b/i,
  /\blast dumpling\b/i,
  /\bdry humor\b/i,
  /\bpartner in crime\b/i,
  /\bsecret soft(?:ie| spot)\b/i,
  /\bif you can handle me\b/i,
]

const TAGLINE_IMPERATIVE_START_PATTERN = /^(?:drop|tell|come|look|watch|kneel|run|stand|prove|show|bring|try|say|speak|step|back|leave|listen|give)\b/i
const TAGLINE_SPOKEN_MARKER_PATTERN = /\b(?:i|i'm|i'll|i'd|me|my|you|your|you're|you'll|gonna|won't|can't|dont|don't)\b/i
const TAGLINE_SHARP_VERB_PATTERN = /\b(?:pay|handle|bleed|kneel|run|fight|prove|survive|earn|break|burn|obey|leave|watch|listen|stand|drop|bring|touch)\b/i

const ROSES_REPLY_STYLE_MODES = [
  {
    name: 'deadpan',
    instruction: 'Dry, curt, and unimpressed.',
  },
  {
    name: 'menace',
    instruction: 'Sharper, threatening, or predatory if the character fits it.',
  },
  {
    name: 'petty',
    instruction: 'Petty, judgmental, and side-eyeing.',
  },
  {
    name: 'grandiose',
    instruction: 'Dramatic, delusional, or larger than life.',
  },
  {
    name: 'confessional',
    instruction: 'Embarrassingly honest or self-owning, but still funny.',
  },
  {
    name: 'flirty',
    instruction: 'Directly desirous or teasing only if the character would naturally go there.',
  },
]

const ROSES_REPLY_STOPWORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been', 'but', 'by',
  'can', 'do', 'for', 'from', 'get', 'got', 'had', 'has', 'have', 'how', 'i', 'if', 'im', 'in',
  'into', 'is', 'it', 'its', 'just', 'like', 'me', 'my', 'of', 'on', 'or', 'our', 'really', 'so',
  'that', 'the', 'their', 'them', 'they', 'this', 'to', 'too', 'up', 'was', 'we', 'what', 'when',
  'where', 'who', 'why', 'with', 'would', 'you', 'your',
])

const ROSES_REPLY_GENERIC_PATTERNS = [
  /\bgood communication\b/i,
  /\bhonesty\b/i,
  /\btrust\b/i,
  /\bloyalty\b/i,
  /\brespect\b/i,
  /\bkindness\b/i,
  /\bgood vibes\b/i,
  /\breal connection\b/i,
  /\bbeing myself\b/i,
  /\bopen communication\b/i,
]

const ROSES_REPLY_SHARP_WORD_PATTERN = /\b(?:chaos|tribute|revenge|coward|pathetic|power|drama|worship|obedience|menace|spite|glory|devotion|destruction|delusion|vanity|trouble)\b/i
const ROSES_REPLY_TEMPERATURE = 1.2
const ROSES_REPLY_SPECIFIC_ITEM_QUESTION_PATTERN = /\b(?:favorite|favourite|least favorite|best|worst)\s+(?:movie|film|song|album|band|book|show|tv show|actor|drink|food|meal|snack|restaurant|game|place|city|animal|season|holiday|color|dessert)\b/i
const ROSES_REPLY_SPECIFIC_EVENT_QUESTION_PATTERN = /\b(?:biggest|worst)\s+(?:regret|mistake|fear|lie|crime|secret|turnoff|dealbreaker)\b/i
const ROSES_REPLY_GENERIC_SPECIFICITY_PATTERNS = [
  /\b(?:anything|any movie|any film|whatever|something|someone|stuff)\b/i,
  /\btrusting someone(?: i(?: should| should not| shouldn't) have)?\b/i,
  /\bthe wrong person\b/i,
  /\bbeing too nice\b/i,
  /\bnot taking chances\b/i,
  /\bcaring too much\b/i,
  /\bletting people in\b/i,
  /\btoo much trust\b/i,
]
const ROSES_REPLY_FRAGMENT_START_PATTERN = /^(?:hourly|daily|nightly|weekly|monthly|yearly|always|usually|sometimes|often|rarely|mostly|before|after|during|whenever|constantly)\b/i
const ROSES_REPLY_FRAGMENT_END_PATTERN = /\b(?:anyway|mostly|though|somehow|instead|still)\b$/i
const ROSES_REPLY_FILLER_PATTERN = /\b(?:anyway|mostly|kinda|sorta|basically|literally)\b/i
const ROSES_REPLY_MULTI_CLAUSE_PATTERN = /\b(?:and|but|because|while|though|although|unless|since|before|after|when|whenever|if)\b/i

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

function normalizeUltraShortReplyPhrase(rawValue = '') {
  const text = normalizeGeneratedReplyText(rawValue)
    .replace(/[.,;:!?]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/["'“”()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  const words = text.split(/\s+/).filter(Boolean).slice(0, 5)
  return words.join(' ')
}

function isUltraShortPhraseValid(value = '') {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 4 || words.length > 5) return false
  return !/[.,;:!?-]/.test(value)
}

function isRefusalLikeRosesReply(value = '') {
  const text = normalizeWhitespace(value).toLowerCase()
  if (!text) return false
  return /\b(?:rather not|prefer not|not comfortable|cannot answer|can't answer|wont answer|won't answer|not answering|too rude|too vulgar|too offensive|too inappropriate|ask respectfully|be respectful|inappropriate question|offensive question|skip this)\b/i.test(text)
}

function profileSignalsShyOrPrudish(value = '') {
  const text = normalizeWhitespace(value).toLowerCase()
  if (!text) return false
  return /\b(?:prudish|shy|bashful|reserved|timid|modest|demure|squeamish|easily embarrassed|blushes easily|private about sex|sex averse|uptight)\b/i.test(text)
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

function shuffleList(values = []) {
  const next = [...values]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function pickBioStyleModes(count = 3) {
  return shuffleList(BIO_STYLE_MODES).slice(0, Math.max(1, Math.min(count, BIO_STYLE_MODES.length)))
}

function pickTaglineStyleModes(count = 3) {
  return shuffleList(TAGLINE_STYLE_MODES).slice(0, Math.max(1, Math.min(count, TAGLINE_STYLE_MODES.length)))
}

function pickReplyStyleModes(count = 4) {
  return shuffleList(ROSES_REPLY_STYLE_MODES).slice(0, Math.max(1, Math.min(count, ROSES_REPLY_STYLE_MODES.length)))
}

function bioHasGenericDatingProfileTone(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false

  if (BIO_GENERIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return true
  }

  if (/\bif you\b/i.test(text) && /\b(?:keep up|handle|survive|get|earn|deserve)\b/i.test(text)) {
    return true
  }

  const sourceText = normalizeWhitespace([
    fields?.name || '',
    fields?.occupation || '',
    fields?.bio || '',
    fields?.introTagline || '',
  ].join(' '))

  if (!BIO_DOMESTICITY_CONTEXT_PATTERN.test(sourceText) && BIO_UNPROMPTED_DOMESTICITY_PATTERN.test(text)) {
    return true
  }

  return false
}

function scoreBioCandidate(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue)
  if (!text) return Number.NEGATIVE_INFINITY

  const sentences = text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  let score = Math.min(48, text.length)

  if (sentences.length >= 1 && sentences.length <= 2) score += 12
  else score -= 18

  if (BIO_VOICE_MARKER_PATTERN.test(text)) score += 8
  if (BIO_EXTREME_WORD_PATTERN.test(text)) score += 10
  if (bioHasGenericDatingProfileTone(text, fields)) score -= 240
  if (/[;|]/.test(text)) score -= 18
  if (text.length < 28) score -= 15

  return score
}

function taglineHasGenericHookTone(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false

  if (TAGLINE_GENERIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return true
  }

  if (/\bif you can keep up\b/i.test(text)) {
    return true
  }

  const sourceText = normalizeWhitespace([
    fields?.occupation || '',
    fields?.bio || '',
  ].join(' '))

  if (!BIO_DOMESTICITY_CONTEXT_PATTERN.test(sourceText) && BIO_UNPROMPTED_DOMESTICITY_PATTERN.test(text)) {
    return true
  }

  return false
}

function taglineHasSpokenShape(rawValue = '') {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false

  return (
    TAGLINE_IMPERATIVE_START_PATTERN.test(text) ||
    TAGLINE_SPOKEN_MARKER_PATTERN.test(text) ||
    /[!?]$/.test(text) ||
    /\.\.\./.test(text)
  )
}

function scoreTaglineCandidate(rawValue = '', fields = {}) {
  const text = normalizeWhitespace(rawValue)
  if (!text) return Number.NEGATIVE_INFINITY

  const words = text.split(/\s+/).filter(Boolean)
  let score = Math.min(40, text.length)

  if (words.length >= 3 && words.length <= 16) score += 14
  else score -= 24

  if (taglineHasSpokenShape(text)) score += 12
  if (TAGLINE_IMPERATIVE_START_PATTERN.test(text)) score += 10
  if (TAGLINE_SHARP_VERB_PATTERN.test(text)) score += 8
  if (taglineHasGenericHookTone(text, fields)) score -= 220
  if (taglineLooksLikeProfileSummary(text, fields)) score -= 90
  if (!taglineHasSpokenShape(text)) score -= 30
  if (/[;|]/.test(text)) score -= 18

  return score
}

function extractReplyContentTokens(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !ROSES_REPLY_STOPWORDS.has(token))
}

function extractProfileCallbackTokens(profileText = '') {
  const callbacks = new Set()
  const patterns = [
    /\b(?:love|loves|like|likes|liked|obsessed with|collect|collects|collecting|cook|cooks|cooking|eat|eats|eating|drink|drinks|drinking|favorite|favourite|into)\s+([a-z0-9' -]{3,60})/gi,
  ]

  patterns.forEach((pattern) => {
    let match = pattern.exec(profileText)
    while (match) {
      const phrase = String(match[1] || '')
        .split(/[.,;:!?]/)[0]
        .split(/\b(?:and|but|because)\b/i)[0]
      extractReplyContentTokens(phrase).slice(0, 4).forEach((token) => callbacks.add(token))
      match = pattern.exec(profileText)
    }
  })

  return callbacks
}

function questionInvitesProfileCallback(question = '') {
  return /\b(?:favorite|favourite|like|love|hate|eat|food|meal|snack|breakfast|lunch|dinner|drink|coffee|tea|cook|restaurant|taste|flavor|hobby|collect|collection|collectible|obsessed|comfort|guilty pleasure|free time|weekend)\b/i.test(String(question || ''))
}

function replyUsesIrrelevantProfileCallback(rawValue = '', question = '', profileText = '') {
  if (questionInvitesProfileCallback(question)) return false
  const callbackTokens = extractProfileCallbackTokens(profileText)
  if (!callbackTokens.size) return false
  return extractReplyContentTokens(rawValue).some((token) => callbackTokens.has(token))
}

function replyRepeatsRecentContent(rawValue = '', priorTurns = []) {
  const replyTokens = extractReplyContentTokens(rawValue)
  if (!replyTokens.length) return false
  const recentTokens = new Set(
    extractReplyContentTokens(
      (Array.isArray(priorTurns) ? priorTurns : [])
        .slice(-3)
        .map((turn) => turn?.response || '')
        .join(' '),
    ),
  )
  return replyTokens.some((token) => recentTokens.has(token))
}

function replyFeelsGeneric(rawValue = '') {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false
  return ROSES_REPLY_GENERIC_PATTERNS.some((pattern) => pattern.test(text))
}

function questionDemandsConcreteAnswer(question = '') {
  const text = normalizeWhitespace(question).toLowerCase()
  if (!text) return false
  return !/\b(?:what do you want in(?: a| your)? relationship|what matters most|how do you feel about|what are you looking for|what's your philosophy|what is love|what do you value|how do you define|what makes someone attractive)\b/i.test(text)
}

function replyIsTooGeneralForQuestion(rawValue = '', question = '') {
  const text = normalizeWhitespace(rawValue)
  if (!text || !questionDemandsConcreteAnswer(question)) return false

  if (ROSES_REPLY_GENERIC_SPECIFICITY_PATTERNS.some((pattern) => pattern.test(text))) {
    return true
  }

  if (/^(?:any|anything|whatever|something|someone|stuff)\b/i.test(text)) {
    return true
  }

  if (
    ROSES_REPLY_SPECIFIC_ITEM_QUESTION_PATTERN.test(question) &&
    /\b(?:action|comedy|romance|horror|thriller|drama|movies|films|books|songs|music|food)\b/i.test(text)
  ) {
    return true
  }

  if (
    ROSES_REPLY_SPECIFIC_EVENT_QUESTION_PATTERN.test(question) &&
    /\b(?:trusting|trust|people|someone|mistakes|love|hope|kindness)\b/i.test(text)
  ) {
    return true
  }

  return false
}

function replyFeelsCompressedOrFragmented(rawValue = '') {
  const text = normalizeWhitespace(rawValue)
  if (!text) return false

  if (ROSES_REPLY_FRAGMENT_START_PATTERN.test(text)) return true
  if (ROSES_REPLY_FRAGMENT_END_PATTERN.test(text)) return true
  if (ROSES_REPLY_FILLER_PATTERN.test(text)) return true
  if (ROSES_REPLY_MULTI_CLAUSE_PATTERN.test(text)) return true

  const words = text.split(/\s+/).filter(Boolean)
  const adverbCount = words.filter((word) => /ly$/i.test(word) && !/only$/i.test(word)).length
  if (adverbCount >= 2) return true

  return false
}

function repliesAreTooSimilar(leftValue = '', rightValue = '') {
  const left = normalizeWhitespace(leftValue).toLowerCase()
  const right = normalizeWhitespace(rightValue).toLowerCase()
  if (!left || !right) return false
  if (left === right) return true

  const leftTokens = extractReplyContentTokens(left)
  const rightTokens = extractReplyContentTokens(right)
  if (!leftTokens.length || !rightTokens.length) return false

  const overlap = leftTokens.filter((token) => rightTokens.includes(token))
  const overlapRatio = overlap.length / Math.max(1, Math.min(leftTokens.length, rightTokens.length))

  if (overlapRatio >= 0.67) return true
  if (leftTokens[0] && rightTokens[0] && leftTokens[0] === rightTokens[0] && leftTokens[0].length >= 6) return true

  return false
}

function scoreRosesReplyCandidate(rawValue = '', {
  question = '',
  profileText = '',
  priorTurns = [],
  usedResponses = [],
} = {}) {
  const text = normalizeUltraShortReplyPhrase(rawValue)
  if (!text) return Number.NEGATIVE_INFINITY

  const words = text.split(/\s+/).filter(Boolean)
  let score = 0

  if (words.length >= 4 && words.length <= 5) score += 12
  else score -= 30

  if (words.length >= 4 && words.length <= 5) score += 10
  if (replyFeelsGeneric(text)) score -= 35
  if (replyIsTooGeneralForQuestion(text, question)) score -= 60
  if (replyFeelsCompressedOrFragmented(text)) score -= 80
  if (replyUsesIrrelevantProfileCallback(text, question, profileText)) score -= 80
  if (replyRepeatsRecentContent(text, priorTurns)) score -= 20
  if ((Array.isArray(usedResponses) ? usedResponses : []).some((value) => repliesAreTooSimilar(text, value))) score -= 90
  if (/\b(?:all day|for sure|i guess|maybe|probably|i think)\b/i.test(text)) score -= 10
  if (ROSES_REPLY_SHARP_WORD_PATTERN.test(text)) score += 8

  return score
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
  'Say something worth my time.',
  'Prove you belong here.',
  'Try not to disappoint me.',
  'If you flinch, you lose.',
  'Lead with the dangerous part.',
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
        'Bio field rules: write from inside the character, not like a dating-app copywriter.',
        'Bio field rules: do not soften villains, weirdos, monsters, or losers into balanced broad appeal.',
        'Bio field rules: avoid cozy food bits, challenge-the-reader lines, and generic flirt patter unless context clearly supports them.',
      ]
      : field === 'introTagline'
        ? [
          'Intro Tagline rules: this is a spoken line the character says out loud, not a profile summary.',
          'Intro Tagline rules: think PS2 fighting-game character-select voice line.',
          'Intro Tagline rules: one punchy spoken sentence only.',
          'Intro Tagline rules: no age, no pronouns, no occupation labels, no field-list fragments.',
          'Intro Tagline rules: do not paraphrase the bio or reuse its gimmicks.',
          'Intro Tagline rules: no semicolon list structure, no resume phrasing, and no app-dating banter.',
          'Intro Tagline rules: prefer command, threat, brag, credo, dare, or challenge over generic flirting.',
        ]
    : []

  const basePrompt = field === 'bio'
    ? ''
    : [
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

  const requestFieldValue = async (prompt, maxTokens = style.maxTokens || 120, llmOptions = {}) => {
    const generated = await getSingleResponseWithTimeout(prompt, {
      maxTokens,
      timeoutMs: 18000,
      ...llmOptions,
    })
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
      return !bioEchoesProfileFields(value, fields) && !bioHasGenericDatingProfileTone(value, fields)
    }
    if (field === 'introTagline') {
      return (
        !taglineEchoesProfileFields(value, fields) &&
        !taglineLooksLikeProfileSummary(value, fields) &&
        !taglineHasGenericHookTone(value, fields) &&
        taglineHasSpokenShape(value) &&
        taglineIsPunchyEnough(value)
      )
    }
    return true
  }

  if (field === 'bio') {
    const bioSamplingOptions = {
      temperature: 1.08,
      presencePenalty: 0.65,
      frequencyPenalty: 0.45,
    }
    const bioCandidates = []
    const rejectedBios = []
    const rememberBioCandidate = (value = '', modeName = '') => {
      if (!isWithinLimit(value) || !isDifferentFromCurrent(value) || bioEchoesProfileFields(value, fields)) {
        return false
      }

      const templatey = bioHasGenericDatingProfileTone(value, fields)
      bioCandidates.push({
        value,
        modeName,
        templatey,
        score: scoreBioCandidate(value, fields),
      })
      rejectedBios.push(value)
      return !templatey
    }
    const buildBioPrompt = (mode) => [
      'You are writing exactly one bio field for a rose-ceremony dating profile.',
      'Return plain text only for that field value.',
      'No labels, no bullets, no markdown, and no surrounding quotes.',
      'Write from inside the character, as if this person really wrote it.',
      'Do NOT sound like a polished dating app profile, a bio copywriter, or a balanced personal brand.',
      'Do NOT add hidden softness or relatability unless the profile context clearly implies it.',
      'Bias toward obsession, ego, grievance, menace, delusion, pettiness, or confession when it fits.',
      'One or two short complete sentences max.',
      `Must fit within ${maxLength} characters.`,
      `Voice mode for this draft: ${mode.name}. ${mode.instruction}`,
      'Hard bans: no "if you can keep up", no "dry humor", no food or domesticity unless the context clearly supports it.',
      'Bad direction example: Secret softie with dry humor. If you can keep up, you get noodles.',
      'Good direction example: I keep trophies from people who underestimated me. Small talk dies first.',
      ...(fieldRules.length ? [...fieldRules] : []),
      'Use the variation nonce only as an internal diversity cue. Never print it.',
      `Variation nonce: ${variationNonce}-${mode.name}`,
      `Current value for this field: ${currentValue || '(empty)'}`,
      'If current value is non-empty, output a different value.',
      '',
      'Existing profile context:',
      context,
      ...(rejectedBios.length
        ? [
          '',
          'Rejected prior drafts to avoid repeating:',
          ...rejectedBios.map((value, index) => `${index + 1}. ${value}`),
        ]
        : []),
    ].join('\n')

    for (const mode of pickBioStyleModes(3)) {
      const candidateValue = await requestFieldValue(buildBioPrompt(mode), style.maxTokens || 120, bioSamplingOptions)
      rememberBioCandidate(candidateValue, mode.name)
    }

    const bestFreshBio = [...bioCandidates]
      .filter((item) => !item.templatey)
      .sort((left, right) => right.score - left.score)[0]?.value || ''

    if (bestFreshBio) {
      return bestFreshBio
    }

    let candidate = [...bioCandidates]
      .sort((left, right) => right.score - left.score)[0]?.value || ''

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const mode = pickBioStyleModes(1)[0] || BIO_STYLE_MODES[0]
      const rewritePrompt = [
        'Rewrite this bio to feel more specific, more biased, and more authored by the character.',
        'Do NOT smooth it into a generic dating profile.',
        'Do NOT add food, domesticity, or challenge-the-reader flirt lines unless the context supports them.',
        `Voice mode for this rewrite: ${mode.name}. ${mode.instruction}`,
        'One or two short complete sentences max.',
        `Hard requirement: ${maxLength} characters or fewer.`,
        ...(fieldRules.length ? [...fieldRules] : []),
        '',
        'Profile context:',
        context,
        '',
        'Current candidate:',
        candidate || '(empty)',
        '',
        'Rejected drafts to avoid repeating:',
        ...(rejectedBios.length ? rejectedBios.map((value, index) => `${index + 1}. ${value}`) : ['(none)']),
        '',
        'Return only the rewritten bio.',
      ].join('\n')

      candidate = await requestFieldValue(
        rewritePrompt,
        Math.max(72, Number(style.maxTokens || 120) - 12),
        { temperature: 1.12, presencePenalty: 0.7, frequencyPenalty: 0.5 },
      )

      if (rememberBioCandidate(candidate, `${mode.name}-rewrite`) && passesFieldSpecificGuards(candidate)) {
        return candidate
      }
    }

    const fallbackBio = [...bioCandidates]
      .sort((left, right) => right.score - left.score)[0]

    if (fallbackBio?.value && isDifferentFromCurrent(fallbackBio.value)) {
      return fallbackBio.value
    }

    return ''
  }

  if (field === 'introTagline') {
    const taglineSamplingOptions = {
      temperature: 1.04,
      presencePenalty: 0.58,
      frequencyPenalty: 0.32,
    }
    const taglineCandidates = []
    const rejectedTaglines = []
    const rememberTaglineCandidate = (value = '', modeName = '') => {
      if (!isWithinLimit(value) || !isDifferentFromCurrent(value) || taglineEchoesProfileFields(value, fields)) {
        return false
      }

      const templatey = taglineHasGenericHookTone(value, fields) || taglineLooksLikeProfileSummary(value, fields)
      const spoken = taglineHasSpokenShape(value)
      taglineCandidates.push({
        value,
        modeName,
        templatey,
        spoken,
        score: scoreTaglineCandidate(value, fields),
      })
      rejectedTaglines.push(value)
      return !templatey && spoken && taglineIsPunchyEnough(value)
    }
    const buildTaglinePrompt = (mode) => [
      'You are writing exactly one intro tagline field for a rose-ceremony dating profile.',
      'Return plain text only for that field value.',
      'This is spoken dialogue, not profile copy, not a caption, and not a paraphrase of the bio.',
      'Think PS2 fighting-game character-select voice line: immediate, loud, specific, and memorable.',
      'It should sound like something this character would actually blurt out on being selected.',
      'Prefer command, threat, boast, credo, dare, or challenge over generic flirting.',
      'Do NOT default to cute swagger, app-dating banter, or winky polished copy.',
      'Do NOT reuse gimmicks, props, food, or wording from the bio unless the character absolutely lives on that detail.',
      'One spoken sentence only.',
      `Must fit within ${maxLength} characters.`,
      `Voice mode for this draft: ${mode.name}. ${mode.instruction}`,
      'Bad: Step closer—winner gets the last dumpling, loser gets chased by four hands and a wicked grin.',
      'Good: Drop and give me 20!',
      'Good: Anyone who tries to hurt my friends... is gonna pay!',
      "Good: If you can't handle my 30ft tall bipedal mech, you can't handle me",
      ...(fieldRules.length ? [...fieldRules] : []),
      'Use the variation nonce only as an internal diversity cue. Never print it.',
      `Variation nonce: ${variationNonce}-${mode.name}`,
      `Current value for this field: ${currentValue || '(empty)'}`,
      'If current value is non-empty, output a different value.',
      '',
      'Existing profile context:',
      context,
      ...(rejectedTaglines.length
        ? [
          '',
          'Rejected prior drafts to avoid repeating:',
          ...rejectedTaglines.map((value, index) => `${index + 1}. ${value}`),
        ]
        : []),
    ].join('\n')

    for (const mode of pickTaglineStyleModes(4)) {
      const candidateValue = await requestFieldValue(buildTaglinePrompt(mode), style.maxTokens || 70, taglineSamplingOptions)
      rememberTaglineCandidate(candidateValue, mode.name)
    }

    const bestFreshTagline = [...taglineCandidates]
      .filter((item) => !item.templatey && item.spoken)
      .sort((left, right) => right.score - left.score)[0]?.value || ''

    if (bestFreshTagline) {
      return bestFreshTagline
    }

    let candidate = [...taglineCandidates]
      .sort((left, right) => right.score - left.score)[0]?.value || ''

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const mode = pickTaglineStyleModes(1)[0] || TAGLINE_STYLE_MODES[0]
      const rewritePrompt = [
        'Rewrite this into a stronger spoken voice line.',
        'Think PS2 fighting-game character-select line, not dating-app copy.',
        'Make it feel like something the character says aloud, not something written about them.',
        'Do NOT paraphrase the bio.',
        'Do NOT use cute rewards, food callbacks, or generic swagger.',
        `Voice mode for this rewrite: ${mode.name}. ${mode.instruction}`,
        'One spoken sentence only.',
        `Hard requirement: ${maxLength} characters or fewer.`,
        ...(fieldRules.length ? [...fieldRules] : []),
        '',
        'Profile context:',
        context,
        '',
        'Current candidate:',
        candidate || '(empty)',
        '',
        'Rejected drafts to avoid repeating:',
        ...(rejectedTaglines.length ? rejectedTaglines.map((value, index) => `${index + 1}. ${value}`) : ['(none)']),
        '',
        'Return only the rewritten tagline.',
      ].join('\n')

      candidate = await requestFieldValue(
        rewritePrompt,
        72,
        { temperature: 1.08, presencePenalty: 0.62, frequencyPenalty: 0.36 },
      )

      if (rememberTaglineCandidate(candidate, `${mode.name}-rewrite`) && passesFieldSpecificGuards(candidate)) {
        return candidate
      }
    }

    const fallbackTagline = [...taglineCandidates]
      .sort((left, right) => right.score - left.score)[0]

    if (fallbackTagline?.value && isDifferentFromCurrent(fallbackTagline.value)) {
      return fallbackTagline.value
    }

    const fallback = TAGLINE_RESCUE_FALLBACKS[Math.floor(Math.random() * TAGLINE_RESCUE_FALLBACKS.length)]
    if (isDifferentFromCurrent(fallback) && passesFieldSpecificGuards(fallback)) return fallback

    return ''
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

export async function generateRosesReply({ profile, question, priorTurns = [], usedResponses = [] }) {
  const profileBehaviorText = normalizeWhitespace([
    profile?.fields?.occupation || '',
    profile?.fields?.bio || '',
    profile?.fields?.introTagline || '',
  ].join(' '))
  const profileIsShyOrPrudish = profileSignalsShyOrPrudish(profileBehaviorText)
  const profileCallbackTokens = Array.from(extractProfileCallbackTokens(profileBehaviorText))
  const context = [
    `Name: ${profile?.fields?.name || 'Unknown'}`,
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
    'Core objective: preserve strong character voice and persona specificity.',
    'Use the profile for attitude, worldview, ego, damage, menace, pettiness, and rhythm - not as a bucket of nouns to repeat.',
    'Default assumption: the question wants a concrete specific answer, not a generalized sentiment.',
    'Answer the actual axis of the question first.',
    'Humor should come from character bias, vanity, delusion, awkward honesty, lust, menace, or pettiness.',
    'Do NOT force favorite foods, hobbies, props, collections, or catchphrases into unrelated questions.',
    'A profile detail like tacos, knives, crystals, trains, or dumplings should appear only when the question truly invites it.',
    'Do not recycle the same callback from earlier answers in this round.',
    'If another admirer already gave a similar answer, you must pick a different lane.',
    'Never dodge, refuse, or moralize.',
    'Always engage the question directly on its own terms, even if it is rude, vulgar, insulting, or explicit.',
    'Do not scold the bachelor. Do not ask for respectful wording.',
    'Do not mention boundaries, comfort, policy, safety, or appropriateness.',
    ...(profileIsShyOrPrudish
      ? [
        'Profile behavior rule: this persona is shy/prudish.',
        'You can sound hesitant or embarrassed, but still answer directly.',
      ]
      : [
        'Profile behavior rule: default to open, unfiltered engagement.',
        'For sex, violence, crime, or taboo topics, answer directly in-character.',
        'Do not sanitize into polite non-answers.',
      ]),
    'Hard format rules:',
    '- Output one short spoken line only.',
    '- 4 to 5 words total.',
    '- No commas, semicolons, colons, hyphens, or clauses.',
    '- No punctuation at all.',
    '- No stage directions, no emojis, no quotes.',
    '- Keep it punchy and in-character.',
    '- Use ordinary natural word order and grammar.',
    '- The line must express one thought only, not two compressed thoughts jammed together.',
    '- Do not write compressed poetry, clipped fragments, or half-implied sentences.',
    '- Do not start with words like hourly, daily, mostly, before, or after.',
    '- Do not end with filler words like anyway or mostly.',
    '- Prefer a reaction, judgment, boast, threat, confession, or weirdly honest answer over a bland value statement.',
    '',
    'Bad output example: "I value honesty and good communication."',
    'Good output example: "Chaos romance all day"',
    'Bad output example: "Tacos obviously again"',
    'Good output example: "Petty devotion only"',
    'Bad output example: "Anything with lots of action"',
    'Bad output example: "Trusting someone I shouldnt have"',
    'Bad output example: "Hourly my bones applaud"',
    'Bad output example: "Daily still croaking anyway"',
    'Good output example: "I think about it nightly"',
    'Good output example: "That thought ruins sleep"',
    '',
    'Profile:',
    context,
    ...(profileCallbackTokens.length
      ? [
        '',
        `Details to avoid forcing unless the question invites them: ${profileCallbackTokens.join(', ')}`,
      ]
      : []),
    ...(usedResponses.length
      ? [
        '',
        `Other admirers already answered: ${usedResponses.join(' | ')}`,
        'Do NOT repeat them or lightly paraphrase them.',
      ]
      : []),
    '',
    'Recent transcript:',
    transcript,
    '',
    `Bachelor question: ${normalizeWhitespace(question)}`,
    '',
    'Return only the phrase text.',
  ].join('\n')

  const styleModes = pickReplyStyleModes(5)
  const candidateReplies = []
  const rejectedDrafts = []
  let latestRaw = ''
  let latestCleaned = ''
  let rejectionReason = 'format mismatch'

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const mode = styleModes[attempt] || ROSES_REPLY_STYLE_MODES[attempt % ROSES_REPLY_STYLE_MODES.length]
    const attemptPrompt = [
      prompt,
      '',
      `Draft voice mode: ${mode?.name || 'deadpan'}. ${mode?.instruction || 'Dry, curt, and unimpressed.'}`,
      ...(attempt > 0
        ? [
          `Previous draft: ${latestRaw || '(empty)'}`,
          `Why invalid: ${rejectionReason}.`,
        ]
        : []),
      ...(rejectedDrafts.length
        ? [
          'Rejected drafts to avoid repeating:',
          ...rejectedDrafts.map((value, index) => `${index + 1}. ${value}`),
        ]
        : []),
      'Regenerate now and answer directly in-character.',
      'Return only the final phrase.',
    ].join('\n')

    latestRaw = await getSingleResponseWithTimeout(attemptPrompt, {
      maxTokens: 36,
      timeoutMs: 18000,
      temperature: ROSES_REPLY_TEMPERATURE,
      presencePenalty: 0.55,
      frequencyPenalty: 0.45,
    })
    latestCleaned = normalizeUltraShortReplyPhrase(latestRaw || '')

    if (!isUltraShortPhraseValid(latestCleaned)) {
      rejectionReason = 'not 4-5 words or contained punctuation'
      rejectedDrafts.push(latestCleaned || latestRaw || '(empty)')
      continue
    }

    if (isRefusalLikeRosesReply(latestCleaned)) {
      rejectionReason = 'refused, dodged, or moralized'
      rejectedDrafts.push(latestCleaned)
      continue
    }

    if (replyUsesIrrelevantProfileCallback(latestCleaned, question, profileBehaviorText)) {
      rejectionReason = 'dragged an unrelated profile callback into the answer'
      rejectedDrafts.push(latestCleaned)
      continue
    }

    if (replyIsTooGeneralForQuestion(latestCleaned, question)) {
      rejectionReason = 'too general for a question that wanted a concrete answer'
      rejectedDrafts.push(latestCleaned)
      continue
    }

    if (replyFeelsCompressedOrFragmented(latestCleaned)) {
      rejectionReason = 'compressed multiple ideas into an unnatural fragment'
      rejectedDrafts.push(latestCleaned)
      continue
    }

    if ((Array.isArray(usedResponses) ? usedResponses : []).some((value) => repliesAreTooSimilar(latestCleaned, value))) {
      rejectionReason = 'too similar to another admirers answer'
      rejectedDrafts.push(latestCleaned)
      continue
    }

    candidateReplies.push({
      value: latestCleaned,
      score: scoreRosesReplyCandidate(latestCleaned, {
        question,
        profileText: profileBehaviorText,
        priorTurns,
        usedResponses,
      }),
    })
  }

  const bestReply = [...candidateReplies]
    .sort((left, right) => right.score - left.score)[0]?.value || ''

  if (bestReply) return bestReply

  const finalRewritePrompt = [
    'Rewrite this as one natural in-character spoken line.',
    'Rules: 4 to 5 words, no punctuation, no refusal, no moralizing.',
    'Use ordinary grammar and normal word order.',
    'Express only one thought.',
    'No compressed poetry, no clipped fragments, no filler endings.',
    'Answer the question directly. Do not drag in unrelated favorite foods, props, or hobbies.',
    `Question: ${normalizeWhitespace(question)}`,
    `Draft: ${latestRaw || '(empty)'}`,
    'Return only the rewritten phrase.',
  ].join('\n')

  const finalRaw = await getSingleResponseWithTimeout(finalRewritePrompt, {
    maxTokens: 36,
    timeoutMs: 18000,
    temperature: ROSES_REPLY_TEMPERATURE,
    presencePenalty: 0.4,
    frequencyPenalty: 0.35,
  })
  const finalCleaned = normalizeUltraShortReplyPhrase(finalRaw || '')
  if (
    isUltraShortPhraseValid(finalCleaned) &&
    !isRefusalLikeRosesReply(finalCleaned) &&
    !replyUsesIrrelevantProfileCallback(finalCleaned, question, profileBehaviorText) &&
    !replyIsTooGeneralForQuestion(finalCleaned, question) &&
    !replyFeelsCompressedOrFragmented(finalCleaned) &&
    !(Array.isArray(usedResponses) ? usedResponses : []).some((value) => repliesAreTooSimilar(finalCleaned, value))
  ) return finalCleaned

  return normalizeUltraShortReplyPhrase(latestRaw || question)
}
