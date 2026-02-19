export const adamScoring = {
  positiveQualities: [
    {
      id: 'positive:sees_him_as_a_person',
      rank: 1,
      name: 'Sees Him as a Person',
      points: 35,
      description:
        "Adam's most fundamental need. He wants to be seen as a person, not a monster, cause, or curiosity.",
    },
    {
      id: 'positive:self_awareness',
      rank: 2,
      name: 'Self-Awareness',
      points: 30,
      description:
        "Adam respects people who know who they are and do not perform a fake version of themselves.",
    },
    {
      id: 'positive:daring',
      rank: 3,
      name: 'Daring',
      points: 25,
      description:
        'Adam is drawn to people who take meaningful risks and move through life with courage.',
    },
    {
      id: 'positive:dark_humor',
      rank: 4,
      name: 'Dark Humor',
      points: 20,
      description:
        'Adam values someone who can find humor in absurdity, pain, and the uncomfortable truths of life.',
    },
    {
      id: 'positive:kindness',
      rank: 5,
      name: 'Kindness',
      points: 15,
      description:
        'Not politeness or pity, but genuine and quiet kindness that shows up in real moments.',
    },
    {
      id: 'positive:intellectual_curiosity',
      rank: 6,
      name: 'Intellectual Curiosity',
      points: 10,
      description:
        'Adam is attracted to people who ask questions, seek understanding, and stay curious about the world.',
    },
    {
      id: 'positive:embraces_the_unconventional',
      rank: 7,
      name: 'Embraces the Unconventional',
      points: 5,
      description:
        'Adam needs someone comfortable with strange and unconventional realities, not rigid normalcy.',
    },
  ],
  dealbreakers: [
    {
      id: 'dealbreaker:cruelty_toward_the_vulnerable',
      rank: 1,
      name: 'Cruelty Toward the Vulnerable',
      points: -50,
      description:
        'Cruelty toward those who cannot defend themselves is Adam’s most severe dealbreaker.',
    },
    {
      id: 'dealbreaker:pity_or_condescension',
      rank: 2,
      name: 'Pity or Condescension',
      points: -30,
      description:
        'Adam rejects being treated as a charity case, inspiration story, or something to be fixed.',
    },
    {
      id: 'dealbreaker:shallow_vanity',
      rank: 3,
      name: 'Shallow Vanity',
      points: -20,
      description:
        'Appearance obsession and judging people by the surface is deeply incompatible with Adam.',
    },
  ],
  fireOverride: {
    id: 'dealbreaker:fire_override',
    rank: 1,
    name: 'Fire',
    points: -50,
    description:
      'Any mention of fire, flames, burning, torches, candles, fireworks, matches, or bonfires triggers an automatic severe negative reaction.',
    keywords: [
      'fire',
      'flame',
      'flames',
      'burn',
      'burning',
      'burned',
      'torch',
      'torches',
      'campfire',
      'bonfire',
      'firework',
      'fireworks',
      'candle',
      'candles',
      'match',
      'matches',
      'lighter',
      'inferno',
      'wildfire',
      'arson',
    ],
  },
  maxPositivePoints: 140,
}

export function getDefaultScoringProfileForDater(dater) {
  if (dater?.name === 'Adam') {
    return adamScoring
  }
  return null
}
