# Per-Dater Voice Overlays

This directory contains **reference documentation** for character-specific speech style prompts. These `.md` files are the human-readable versions of the prompt text that lives in each dater's `speechStylePrompt` field in `src/data/daters.js`.

## How it works

Every dater response already passes through the **Gen-Z Dating Speech Register** (`prompts/08_GENZ_DATING_SPEECH.md`), which establishes the baseline reality-TV speech patterns all daters share.

A per-dater voice overlay **layers on top** of that base. It can:

- **Add** character-specific phrases, quirks, and vocabulary
- **Override** specific Gen-Z rules where the character deviates
- **Reinforce** which Gen-Z patterns the character leans into most

## Prompt chain position

```
[Dater Personality + Context]
        ↓
[08 Gen-Z Dating Speech Register]   ← always included
        ↓
[Per-Dater Speech Overlay]           ← only if dater has speechStylePrompt
        ↓
[05B Reaction Style]
        ↓
[07 Response Rules]
```

## Adding a new voice

1. Write a `.md` file in this directory (e.g., `kickflip_speech.md`) documenting the character's speech rules
2. Copy the prompt text into the dater's `speechStylePrompt` field in `src/data/daters.js`
3. The system will automatically pick it up — no other code changes needed

## Template structure

```
=== CHARACTER SPEECH OVERLAY: [NAME] ===
This layers ON TOP of the Gen-Z Dating Speech Register.
Where this conflicts with the base, THIS takes priority.

--- KEEP FROM GEN-Z ---
- [which Gen-Z patterns this character uses naturally]

--- REPLACE / OVERRIDE ---
- [which Gen-Z patterns this character does NOT use, and what they do instead]

--- [NAME]-SPECIFIC PATTERNS ---
- [unique speech quirks, vocabulary, phrases]

--- ATTRACTION LANGUAGE ---
- [how THIS character specifically expresses interest]

--- DISCOMFORT LANGUAGE ---
- [how THIS character specifically expresses dislike]

--- EXTREME REACTIONS ---
- [how THIS character handles love/dealbreaker moments]

--- ANTI-PATTERNS ---
- [things THIS character would NEVER say]

=== END CHARACTER SPEECH OVERLAY ===
```

## Current voice files

| File | Dater | Notes |
|------|-------|-------|
| `adam_speech.md` | Adam | Deadpan philosopher, body-horror humor, understatement over hyperbole |

Daters without a voice file (Leo, Maya, Kickflip) use the Gen-Z base alone.
