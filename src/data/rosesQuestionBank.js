function toKeywordTokenList(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

export const QUESTION_BANK = [
  {
    template: "What's your hottest take about _____?",
    options: ['dating', 'capitalism', 'food'],
  },
  {
    template: 'Do you think _____ is a red flag?',
    options: ['baggage', 'crime', 'stupidity'],
  },
  {
    template: "What's your favorite _____?",
    options: ['movie', 'book', 'historical disaster'],
  },
  {
    template: "What's the earliest you'd _____ in a relationship?",
    options: ['kiss', 'open up', 'move in'],
  },
  {
    template: 'Do you think _____ is ever justifiable?',
    options: ['capital punishment', 'double dipping', 'cheating'],
  },
  {
    template: "I'm running around _____. What do you do?",
    options: ['on fire', 'with your bff', 'lying'],
  },
  {
    template: 'I confess to you that _____. What do you do?',
    options: ["i'm in love", "i'm a killer", 'i have kids'],
  },
]

const LEGACY_FILTER_PROMPTS = [
  {
    template: "What's your favorite _____?",
    options: ['food', 'movie', 'date night'],
  },
  {
    template: "What's your least favorite _____?",
    options: ['meal', 'historical figure', 'sensation'],
  },
  {
    template: "You see me and I'm _____. What do you do?",
    options: ['asleep', 'in trouble', 'smiling'],
  },
  {
    template: 'How often do you _____?',
    options: ['date', 'regret', 'lie'],
  },
  {
    template: "What's your biggest _____?",
    options: ['regret', 'accomplishment', 'desire'],
  },
  {
    template: "What's your preference when it comes to _____?",
    options: ['season', 'love language', 'extended families'],
  },
  {
    template: 'Where would you take me on a first date?',
    options: [],
  },
  {
    template: "What's something you do that would impress me?",
    options: [],
  },
  {
    template: 'If you had a million dollars, how would you spend it?',
    options: [],
  },
]

export const ROSES_BUILT_IN_KEYWORD_BLOCKLIST = new Set(
  [...QUESTION_BANK, ...LEGACY_FILTER_PROMPTS].flatMap((entry) => [
    ...toKeywordTokenList(entry?.template || ''),
    ...(Array.isArray(entry?.options)
      ? entry.options.flatMap((option) => toKeywordTokenList(option))
      : []),
  ]),
)

export function extractRosesCustomQuestionText(questionText = '') {
  const question = String(questionText || '').trim()
  if (!question) return ''

  for (const entry of QUESTION_BANK) {
    const template = String(entry?.template || '')
    if (!template.includes('_____')) continue

    const [prefix, suffix] = template.split('_____')
    if (!question.startsWith(prefix) || !question.endsWith(suffix)) continue

    const endIndex = suffix ? question.length - suffix.length : question.length
    return question.slice(prefix.length, endIndex).trim()
  }

  return question
}
