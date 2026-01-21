# Prompt 1: Classify Attribute

## Purpose
Determine if a new attribute is VISIBLE (physical) or NON-VISIBLE (behavioral/personality).

## Input
- `attribute`: The new attribute being added (e.g., "is on fire", "loves murder")

## Prompt

```
TASK: Classify this attribute as VISIBLE or NON-VISIBLE.

ATTRIBUTE: "[attribute]"

VISIBLE means the Dater can physically SEE this trait with their eyes.
NON-VISIBLE means the Dater can only INFER this from what the Avatar says.

VISIBLE KEYWORDS (if ANY of these appear, it's likely VISIBLE):
- Body parts: eye, arm, leg, head, hand, tail, wing, tentacle, claw, horn, antenna, teeth, skin, hair, face
- Species: spider, vampire, werewolf, zombie, robot, alien, ghost, demon, monster, creature, animal
- Physical states: fire, burning, glowing, floating, melting, rotting, bleeding, dripping, oozing
- Size/appearance: tall, short, giant, tiny, muscular, skinny, fat, beautiful, ugly, attractive
- Medical/physical: pregnant, disabled, blind, deaf, bald, hairy, scarred, injured, wounded
- Colors/materials: red, blue, green, metallic, wooden, stone, crystal, transparent, invisible

RESPOND WITH ONLY ONE WORD: "VISIBLE" or "NON-VISIBLE"
```

## Output
- `visibility`: Either "VISIBLE" or "NON-VISIBLE"

## Next Step
- If VISIBLE → Use prompts 02 + 03 for Avatar, then 04 for Dater
- If NON-VISIBLE → Use prompt 02 for Avatar, then 05 for Dater
- Always include prompt 06 (Core Personality) and 07 (Rules) with Avatar prompts
