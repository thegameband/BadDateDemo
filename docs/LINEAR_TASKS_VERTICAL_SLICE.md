# Bad Date Vertical Slice – Linear Task Structure

**Design reference:** [Single-Player Daily Design](./SINGLE_PLAYER_DAILY_DESIGN.md).

**Overall target:** Single-player daily game. Flow: **Match screen** → **Date** (6 rounds: game asks question → player types → dater reacts; dater only speaks) → **Wrap-up**. No timers; debug menu for 5–6 daters.

**Two tracks:**

- **Track A (from scratch):** An engineer builds a new single-player implementation. Multiplayer is never built; no “strip” tasks. All tasks are “build X.”
- **Track B (vibe-coded demo):** Add the new design elements into the existing vibe-coded prototype (which stays alive for development). Tasks are “add X to the demo” or “change demo to do Y.”

Use these as issues in Linear; group by track and milestone or cycle as needed.

---

# Track A: From-Scratch Single-Player Build

*Engineer builds a new codebase. Single-player only — multiplayer is simply not built. All tasks are positive “build” tasks.*

## A1 – Entry and dater selection

| Title | Description |
|-------|-------------|
| **Build entry / Play screen** | Simple entry: player taps Play (or similar) and proceeds. No lobby, no room codes, no other players. |
| **Build single dater selection for session** | At session start, select one dater from a pool (e.g. 5–6). Can be first, random, or simple picker; debug menu optional. |
| **Build Match screen** | Screen before date: show today’s dater with picture, age, gender, occupation, 1–2 hobbies. Single button: **Start date**. |
| **Build debug menu for dater selection** | Dev-only (or feature-flagged) way to choose which of 5–6 daters is “today’s” date for testing. |

## A2 – Dater data and attributes

| Title | Description |
|-------|-------------|
| **Build dater profiles (5–6 daters)** | Define dater schema and 5–6 profiles: name, archetype, description, backstory, values, idealPartner, dealbreakers, stats, quirk, talkingTraits, etc. (Align with design doc and existing `daters.js` structure if reusing.) |
| **Build hidden dater values (loves, likes, dislikes, dealbreakers)** | At game start, generate or load per-dater hidden values; use them for sentiment and LLM context. |
| **Source Match screen stats from dater data** | Age, gender, occupation, hobbies, picture on Match screen come from the selected dater profile. |

## A3 – LLM and dater reactions

| Title | Description |
|-------|-------------|
| **Build dater response pipeline (LLM)** | Build prompt from dater personality, conversation history, compatibility, and player answer; call LLM; return dater line only (no avatar line). Same conceptual flow as current `getDaterResponseToPlayerAnswer` / `getDaterResponseToJustification`. |
| **Build visible vs inferred handling** | Classify player answer as visible (physical) vs non-visible (personality); visible = dater reacts to what they “see”; non-visible = dater infers from context. |
| **Build reaction intensity and “stuck on date”** | Apply 2–3× intensity for big reveals; dater cannot leave the date; sentiment-driven tone per design. |
| **Build sentiment and value matching** | Classify reactions into loves/likes/dislikes/dealbreakers; drive from hidden dater values and player content (e.g. checkAttributeMatch-style logic). |
| **Build Justify mechanic** | When dater reacts strongly negatively, show Justify step: player submits one follow-up; dater reacts again via LLM. No timer. |

## A4 – Compatibility system

| Title | Description |
|-------|-------------|
| **Build 5-factor compatibility** | Implement physicalAttraction, similarInterests, similarValues, similarTastes, similarIntelligence with activation and weighting (physical higher at start, equalize over time). Drop lowest factor; compute overall 0–100. |
| **Compatibility updates only on dater reaction** | Change compatibility only when the dater has reacted and sentiment/factor logic runs; not on player submit alone. |
| **Build compatibility reason in UI** | Show brief reason (e.g. “+5 interests”) when score changes; clear after delay. |
| **Build wrap-up and results screen** | End-of-date compatibility calculation and results screen (breakdown, outcome) per design. |

## A5 – Date flow (6 rounds, no timers, dater-only speech)

| Title | Description |
|-------|-------------|
| **Build date flow: exactly 6 rounds, no timers** | Date = 6 rounds. Each round: game shows Date Question → player types answer → submit → dater reacts. Advance when reaction is done; no countdown timers. |
| **Build game-asked Date Questions** | Pool of date questions; game (system/narrator) asks one per round at random (or by round index). Dater does not ask the question. |
| **Build player text input (mobile)** | Primary input = text. Player types on phone keyboard and submits. Mobile-first. |
| **Dater-only dialogue** | Only the dater speaks. No avatar lines; no `getAvatarDateResponse`. Justify remains: one follow-up from player, dater reacts again. |
| **Build date scene UI** | Layout: Date Question visible, text input, dater reply and portrait/expression. Suited for mobile. |

## A6 – Plot Twist, TTS, expressions

| Title | Description |
|-------|-------------|
| **Build Plot Twist flow** | Plot Twist subphases (e.g. after round 3): interstitial, input, reveal, animation, winner, reaction. No timers; advance on Continue or equivalent. |
| **Build TTS for dater and narrator** | TTS for dater lines and for Plot Twist text (and optional phase intros). |
| **Build dater expressions / portraits** | Expression service and dater portraits/expressions driven by emotion/sentiment. 2D for now. |

## A7 – Documentation

| Title | Description |
|-------|-------------|
| **Document from-scratch architecture and flow** | Match → Date (6 rounds) → Wrap-up; no timers; dater-only speech; debug menu; where dater data and LLM live. |

---

# Track B: Add New Design Elements to Vibe-Coded Demo

*The existing vibe-coded prototype stays alive. These tasks add or change the demo so it matches the single-player daily design. No “from scratch” build; all work is in the current codebase.*

## B1 – Match screen and dater selection

| Title | Description |
|-------|-------------|
| **Add Match screen to vibe-coded demo** | New screen before the date: show today’s dater with picture, age, gender, occupation, 1–2 hobbies. Single button: **Start date**. Insert in flow (e.g. after entry, before live-date). |
| **Add debug menu to select from 5–6 daters** | Dev-only (or feature-flagged) menu to choose which dater is “today’s” date. Use existing `daters.js`; ensure one dater is selected for the session. |
| **Wire “today’s” dater into existing date flow** | Ensure the dater chosen on Match (or via debug) is the one used in LiveDateScene; no lobby/room required for this path. |

## B2 – Date flow: 6 rounds, no timers

| Title | Description |
|-------|-------------|
| **Change date to exactly 6 rounds** | Refactor LiveDateScene so the date has exactly 6 rounds (question → answer → dater reaction). Keep existing cycle/phase logic but fix round count to 6. |
| **Remove all phase and plot-twist timers** | Remove or bypass phase timer, starting-stats timer, plot-twist timer, etc. Progression is turn-based: submit → dater reacts → next round (or Continue). |
| **Advance rounds on reaction done (no countdown)** | When dater’s reaction is done (and optional Justify if shown), advance to next round without waiting for a timer. |

## B3 – Game-asked questions and player text input

| Title | Description |
|-------|-------------|
| **Add pool of Date Questions and game-asked prompt** | The game (not the dater) asks a “Date Question” each round. Add a pool of questions; pick at random (or by round index). Display as system/narrator text. |
| **Add player text input for date answers** | In the date flow, let the player type their answer (mobile keyboard) and submit. Replace or supplement current wheel/choice-based input for the main date loop. Mobile-first. |
| **Wire player text to dater reaction pipeline** | On submit, send the player’s text to the existing dater-reaction pipeline (LLM, compatibility, sentiment). No avatar line in the UI. |

## B4 – Dater-only dialogue (silent avatar)

| Title | Description |
|-------|-------------|
| **Remove avatar speech from date flow** | Avatar never speaks in the date. Remove or stub `getAvatarDateResponse` and any avatar dialogue in LiveDateScene. Only the dater has spoken lines. |
| **Keep dater LLM and Justify** | Keep existing dater response pipeline and Justify mechanic; ensure only dater lines are shown. Justify: one follow-up from player, dater reacts again. |

## B5 – UI and presentation

| Title | Description |
|-------|-------------|
| **Update date scene UI: question + text input + dater reply** | Layout in LiveDateScene: Date Question visible, text input for player, dater reply and portrait/expression. Suited for mobile. |
| **Match screen stats from dater profile** | Age, gender, occupation, hobbies, picture on Match screen sourced from selected dater in `daters.js`. |
| **Document daily flow in vibe-coded demo** | Short doc: how to run “daily” path (Match → Date 6 rounds → Wrap-up), no timers, dater-only speech, debug menu. |

---

# Phase 3: 3D and Polish (applies to either track)

*Once the single-player daily flow exists (from Track A or Track B), add 3D scene and polish.*

## 3.1 – 3D scene and presentation

| Title | Description |
|-------|-------------|
| **First-person 3D café scene (portrait, mobile)** | Three.js: first-person view at café table facing dater, portrait mode, mobile-web friendly. |
| **5–6 hand-crafted 3D dater models** | Distinct 3D models per dater; no procedural art. Clear visual identity per character. |
| **Dynamic dater reactions in 3D** | Drive 3D dater animations from conversation (emotion/sentiment). Replace or augment 2D expressions. |
| **Integrate question/input UI into 3D** | Date Question + text input + dater reply overlay or in-world; polished for non-dev playtest. |

## 3.2 – Content and polish

| Title | Description |
|-------|-------------|
| **Daily rotation (or seed) for “today’s” dater** | In production, determine “today’s” dater by date (rotation or seed). Debug menu still overrides for dev. |
| **Replayability: randomized traits per dater** | Optional: per-dater randomized traits (e.g. hobbies, quirks) for variety; core personality fixed. |
| **Polish for playtesting** | Final pass on readability, touch targets, and flow on phone. |
| **Stretch: 3–5 attribute-triggered effects** | Optional in-scene effects from attributes (e.g. camera, tint). |

---

# Deliverable 2: Character Attribute Generation System

*Can run in parallel. Not tied to Track A or B.*

| Title | Description |
|-------|-------------|
| **Character sheet template** | Define structured character sheet template (personality, quirks, conversation style, triggers) for tool output and game consumption. |
| **LLM prompt pipeline for character generation** | Build prompts + pipeline: seed attributes or example character → LLM → full character sheet matching template. |
| **Seed input: attributes or example character** | Support input as seed attributes and/or rough example; normalize for LLM and template. |
| **Standalone, reusable character-gen tool** | Package as standalone, modular tool (CLI or small app) for use beyond Bad Date; document usage. |
| **Quality bar: consistency across characters** | Iterate on templates and prompts for consistent, high-quality output; add validation or review checklist. |

---

# Stretch: Character Art Generation System

| Title | Description |
|-------|-------------|
| **Art pipeline: attributes → visual brief** | Pipeline from character attributes (Deliverable 2) to visual brief for art (portraits, expressions). |
| **Generate character visuals (portraits/expressions)** | Implement or integrate generation of visuals from brief; scope TBD (2D vs 3D, style). |
| **Modular, reusable art pipeline** | Make pipeline modular and reusable; document inputs, outputs, iteration workflow. |
| **Quick iteration workflow for character art** | Support fast iteration (change attributes → regenerate/tweak assets); document workflow. |

---

## Suggested ordering

- **Track A:** A1 → A2 → A3 → A4 → A5 → A6 → A7. Engineer builds single-player experience from scratch; no multiplayer.
- **Track B:** B1 → B2 → B3 → B4 → B5. Add match screen, 6 rounds, no timers, game-asked questions, player text input, silent avatar to the vibe-coded demo.
- **Phase 3:** After either track has the daily flow; 3.1 → 3.2.
- **Deliverable 2** and **Stretch** can run in parallel when useful.

Use this file as the source of truth for Linear issues; assign tasks to the appropriate track and milestone/cycle.
