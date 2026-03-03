// Locations for Drop a Line / Pick Up Mode reel (design-owned list)
export const DROP_A_LINE_LOCATIONS = [
  'Aquarium',
  'Elevator',
  'Auto Garage',
  'Pawn Shop',
  'Meeting of the United Nations',
]

/** Grammatically correct phrase for "at X" in scene title (e.g. "the Aquarium", "an Elevator") */
export const DROP_A_LINE_LOCATION_PHRASES = {
  'Aquarium': 'the Aquarium',
  'Elevator': 'an Elevator',
  'Auto Garage': 'an Auto Garage',
  'Pawn Shop': 'a Pawn Shop',
  'Meeting of the United Nations': 'a Meeting of the United Nations',
}

/** Static background image path per location (pre-baked, no Gemini) */
export const DROP_A_LINE_LOCATION_IMAGES = {
  'Aquarium': '/images/drop-a-line/backgrounds/aquarium.jpg',
  'Elevator': '/images/drop-a-line/backgrounds/elevator.jpg',
  'Auto Garage': '/images/drop-a-line/backgrounds/auto-garage.jpg',
  'Pawn Shop': '/images/drop-a-line/backgrounds/pawn-shop.jpg',
  'Meeting of the United Nations': '/images/drop-a-line/backgrounds/united-nations.jpg',
}
