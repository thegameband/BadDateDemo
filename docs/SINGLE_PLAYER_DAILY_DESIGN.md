# Bad Date: Daily Game – Design

This document describes the **Bad Date** daily game: how it flows, how you play, and how the dater and compatibility systems work.

---

# Part 1: Flow and Structure

## 1.1 Canonical game flow (step-by-step)

1. **Play** – Player presses the **Play** button. No name entry at this stage.
2. **Dater Bio Page** – Player is taken to a screen showing:
   - **Image** of the dater.
   - **Info from the dater’s personality:** age, gender, occupation, hobbies (and any other bio fields).
   - A **START THE DATE** button.
3. **Create Your Avatar (3 questions)** – After the player taps Start the Date, the game asks **3 questions** about the player (the avatar), one by one. Player provides answers; no timer.
   - “How do you look?” (physical)
   - “How are you feeling?” (emotional state)
   - “What is your name?”
4. **Date begins – First impressions** – The **dater** opens the date by offering their **first impressions of the avatar**, based on: **physical description** and **name** (primary), and **emotional state** (to a lesser degree).
5. **Date Rounds 1–6** – For each round:
   - The **game** asks a question (the dater does not ask it).
   - The **player** has the opportunity to answer (single text input, no chat window).
   - The **player** submits their answer.
   - The **dater** responds to the player’s answer.
   - **After Round 3 only:** the **Plot Twist** runs (see 1.6.2); then the game continues to Round 4.
   - Repeat for the next round.
6. **Wrap up** – After round 6, the game moves to the **Wrap up** round. The **dater** sums up how the date went and their impression of the avatar.
7. **Date Review** – The game shows a **Date Review** that calls out **highlights and lowlights** of the date and what the dater thought of them.
8. **Score** – The **compatibility percentage** (score) is shown.

## 1.2 Dater Bio Page (before the date)

- **Entry:** Reached when the player presses Play (no name entry); this is the first content screen after Play.
- **Content:** All pulled from the **dater’s personality** (e.g. `src/data/daters.js`):
  - **Image** – Dater portrait/photo.
  - **Age, gender, occupation** – Core bio fields.
  - **Hobbies** – One or two (or more) from the dater profile.
- **Action:** A single button: **START THE DATE**. No timers. Tapping it leads to the 3 questions (Create Your Avatar).

## 1.3 Create Your Avatar (3 questions)

After “Start the date,” the player **creates their avatar** (the person the dater is on a date with) by answering **3 questions** only. No timer; only the player answers.

- **Question 1:** “How do you look?” (physical / appearance)
- **Question 2:** “How are you feeling?” (emotional state)
- **Question 3:** “What is your name?”

Answers are freeform text. Progression: player submits an answer → next question → after the 3rd, the date begins (first impressions).

## 1.4 First impressions (date open)

When the date begins, the **dater** speaks first. Their line is **first impressions of the avatar**, based on:

- **Physical description** (primary).
- **Name** (primary).
- **Emotional state** (to a lesser degree).

Only the dater speaks; no avatar dialogue.

## 1.5 Match / dater selection (when applicable)

- **Who the player is matched with:** one dater (the “daily” date). On the Dater Bio Page, that dater’s image and info are shown.
- **Daily behavior:** in production, “today’s” dater can be determined by calendar (e.g. rotation or seed by date). For development: **debug menu** to choose among **5–6 daters**.

## 1.6 Date: round structure (6 rounds)

Each round:

1. **Game asks a question** – The **game** (system/narrator) shows a **Date Question**; the dater does not ask it. Question is **random** from a pool (per round or round index).
2. **Player answers in a single input** – The UI shows **one text input field** (and submit) for the player to give their answer. **Whatever the player submits is the answer** — no voting, no wheel, no “correct” answer.
3. **Player submits** – On submit, the answer is sent; **no timer**. Progression is turn-based only.
4. **Dater reacts** – The **dater** responds (speech + reaction). **Only the dater speaks;** the avatar never has dialogue. See Part 2 and Part 3 for how reactions and compatibility work. The dater may be **slightly more verbose** (e.g. 2–4 sentences) since they are the only one speaking.
5. **Next round** – When the dater’s reaction is done, the next round starts.

After **6 rounds**, the game moves into the **wrap-up** (see 1.1 steps 6–8).

### 1.6.1 No wheel; question + answer always sent to LLM

- There is **no answer wheel** or multi-option selection. The only input is the player’s freeform text (which can be a single word, a phrase, or a sentence).
- The **LLM must always receive the round question and the player’s answer** so it has full context. For single-word answers (e.g. “Cheese”) this is essential: the dater reacts to “What’s your guilty pleasure?” + “Cheese,” not to “Cheese” alone. The dater response pipeline must be called with `(question, playerAnswer)` (or equivalent) every time.

### 1.6.2 Plot Twist (after Round 3)

After the dater’s response to **Round 3**, the game inserts a **Plot Twist** beat. It does **not** add an extra question round; the total remains 6 rounds. Flow:

1. **Interstitial** – A short title card: e.g. “Another person hit on [Dater]! What do you do?”
2. **Input** – A single text input. The player types what they would do (e.g. “Challenge them to a dance-off,” “Politely ask them to leave”) and submits.
3. **Outcome** – The game uses the player’s answer as the outcome (no wheel).
4. **“What Happened”** – A short narrative is generated (or selected) describing what happened based on that action. The player sees this summary (e.g. in a “What Happened” card).
5. **Dater reaction** – The **dater** reacts to that story in a few sentences (in character), then the game continues to **Round 4**.

So: Round 3 response → Plot Twist (interstitial → input → What Happened → dater reaction) → Round 4.

## 1.7 Game characteristics

- **Single-player.** One player; no room codes or other players.
- **No timers.** Progression is turn-based: the player submits an answer → the dater reacts → the game advances when the reaction is done.
- **Dater-only speech.** During the date, only the dater speaks; the avatar has no dialogue.

## 1.8 States

- **Play** – Entry; no name entry.
- **Dater Bio Page** – Image + age, gender, occupation, hobbies; **START THE DATE** button.
- **Create Your Avatar** – 3 questions (look, feeling, name); player answers only, no timer.
- **Date** – First impressions (dater) → 6 rounds: [game asks] → [player answers] → [dater responds]. After Round 3, **Plot Twist** (interstitial → input → What Happened → dater reaction) then Round 4. No chat window; no timers.
- **Wrap-up** – Dater sums up the date and their impression.
- **Date Review** – Highlights and lowlights; what the dater thought.
- **Score** – Compatibility percentage.

## 1.9 Platform

- **Primary:** phone (mobile). Text input is the main answer method (phone keyboard).

---

# Part 2: How the Dater Reacts

## 2.1 Overview

The dater uses an LLM (e.g. Claude) to generate contextual, personality-driven responses. Flow:

- **Input:** what the player said (and optionally visible/inferred context).
- **Context:** dater personality, compatibility, sentiment hit (if any).
- **Output:** dater’s spoken reply + sentiment used to update compatibility.

The avatar does **not** speak during the date; only the dater’s reaction is shown.

## 2.2 Dater personality system

Each dater has a profile (e.g. in `src/data/daters.js`):

**Core profile:** name, pronouns, archetype, description, backstory, upbringing, hometown, friends, spirituality, values, beliefs, admires.

**Behavioral:** formality, complexity, quirk, talkingTraits, characterReferences.

**Compatibility-related:** idealPartner, dealbreakers.

**Stats (fine-grained):** chattiness, steering, adaptability, inquisitiveness, empathy, supportiveness, reassurance, depth, agreeableness, vulnerability, directness, sensitivity, flirtatiousness, shyness.

The LLM prompt is built from: identity, personality layers, behavioral guidance, compatibility context (idealPartner, dealbreakers), phase-specific instructions, and critical rules (brevity, no action tags, stay in character).

## 2.3 Visible vs inferred (player’s answer)

- **Visible:** If the player’s answer describes something **physical** (body, appearance, species, physical state, etc.), the dater is instructed to react as if they can **see** it — literal, not metaphorical (e.g. “on fire” = really on fire).
- **Non-visible:** For non-physical content (personality, preferences, backstory), the dater **infers** from what the player said and reacts to that interpretation.

This distinction is used when building the dater’s prompt so reactions match what the dater “knows” or “sees.”

## 2.4 Reaction intensity and length

- **Normal:** Standard personality-driven response; reference context naturally.
- **Strong / new revelation:** When the player says something that clearly lands as a big deal (e.g. a major trait or revelation), the dater’s reaction can be **2–3× more intense** — more honest, more positive or negative.
- **Verbosity:** Because only the dater speaks, responses may be **slightly more verbose** than strict 1–2 sentences (e.g. 2–4 sentences) when it fits the moment, so the date feels conversational rather than clipped.

Reaction guidelines (conceptually): horrifying → horrified; dangerous → concerned; gross → grossed out; scary → scared; weird → weirded out; attractive → into it. The dater is **stuck on the date** (can’t leave), so even negative reactions stay in the scene (nervous laugh, change subject, polite-but-horrified, etc.).

## 2.5 Sentiment and compatibility (reaction → score)

The dater’s response is analyzed for **sentiment** (or matched against hidden dater values). That sentiment drives compatibility changes:

- **Strong positive (+8 to +10)** → category **Loves**
- **Positive (+1 to +7)** → **Likes**
- **Negative (-1 to -7)** → **Dislikes**
- **Strong negative (-8 to -10)** → **Dealbreakers**

The reaction tone is **tempered by current compatibility**: if the date is going poorly, even a “likes” hit may be lukewarm; if it’s going well, even a “dislikes” may get some benefit of the doubt. The system can also trigger a **Justify** step when the dater reacts strongly negatively: player gets one follow-up answer to justify; dater reacts again (no timer).

---

# Part 3: Compatibility System

## 3.1 Five factors

Compatibility is computed from **5 factors** (each 0–100, default 50):

- **physicalAttraction** – Looks, appearance, physical traits.
- **similarInterests** – Hobbies, activities, passions.
- **similarValues** – Moral beliefs, life priorities.
- **similarTastes** – Preferences, styles, aesthetics.
- **similarIntelligence** – Mental connection, wit, depth.

Each factor can be **activated** (has been “discussed” in the conversation). **Unactivated factors contribute only 10%** to the overall score so that only topics that came up matter.

## 3.2 How the overall score is calculated

- **Weighting:** Physical attraction is weighted **higher at the start** of the date; over time (e.g. by conversation turn), weights equalize. Unactivated factors use 10% of their weight.
- **Drop lowest:** The **lowest** of the five (weighted) factor scores is dropped; the other four are combined into a single 0–100 **compatibility** score. So one bad area doesn’t tank the whole score.
- **Recalculation:** After each dater reaction that updates a factor, overall compatibility is recalculated from the five factors (with activation and weighting).

## 3.3 When compatibility changes

- **Only when the dater reacts.** The player’s raw answer does not change the score; the **dater’s reaction** (and its sentiment/category) drives updates.
- **Factor updates:** Sentiment hits (loves/likes/dislikes/dealbreakers) map to **which factor** to update (e.g. physical, interests, values, tastes, intelligence) and by how much (positive or negative change).
- **First activation:** The first time a factor is activated, it can be initialized from the **current overall compatibility** so that the first update in that category moves the score in the right direction (positive change raises it, negative lowers it).
- **Compatibility reason:** When the score changes, a short **reason** can be shown in the UI (e.g. “+5 interests”, “-3 values”) and then cleared after a delay.

## 3.4 Dater values (hidden)

Each dater has **hidden values** (not shown to the player) used to interpret reactions and sentiment:

- **loves** – Strong positive triggers.
- **likes** – Positive triggers.
- **dislikes** – Negative triggers.
- **dealbreakers** – Strong negative triggers.

These can be generated or hand-tuned per dater. The LLM (or a separate step) checks the player’s answer and the dater’s reaction against these to decide sentiment category and compatibility deltas.

---

# Part 4: Other Behaviors

## 4.1 Plot Twist

After Round 3, a **Plot Twist** runs (see 1.6.2). Progression is by player action or “Continue” when ready. TTS/narrator can read Plot Twist text (and optional phase intros).

## 4.2 Wrap-up

After round 6:

1. **Dater summary** – The dater sums up how the date went and their impression of the avatar.
2. **Date Review** – Highlights and lowlights of the date; what the dater thought of them.
3. **Score** – Compatibility percentage is shown.

## 4.3 Justify (full-screen takeover)

When the dater **hates what was said** or is **confused**, the game triggers **Justify**:

1. **Full-screen takeover** – The screen is taken over by a clear prompt: **“Justify Your Opinion”** (or equivalent). No other UI; player focuses on explaining.
2. **Player types one justification** – Single text input (same style as round answers); no timer.
3. **Return to the date** – After submit, the game returns to the date view and the **dater** responds with a line like: *“Do you want to explain that a little more?”* or similar (in character, inviting the player to have said their piece). Then the round continues (e.g. dater’s follow-up reaction to the justification, then advance when done). No timer; advance when the dater’s reaction is done.

## 4.4 Fallback

When the LLM is unavailable, fallback logic can use simple rules (e.g. question vs statement, keywords) to pick a canned dater response so the game still runs.

---

# Part 5: Debug / Dev

- **Debug menu:** Choose which of the **5–6 daters** is “today’s” date so any character can be tested without daily rotation.
- “Daily” in production can be faked (e.g. deterministic by date or a rotation).

---

# Summary

- **Flow:** Play (no name) → **Dater Bio Page** (image + age, gender, occupation, hobbies + START THE DATE) → **3 questions** (look, feeling, name) → **Date begins** (dater’s first impressions of avatar) → **6 rounds** (game asks → player answers → dater responds) → **Wrap-up** (dater sums up) → **Date Review** (highlights/lowlights) → **Score** (compatibility %). Single-player, no chat window in date mode, no timers, dater-only speech.
- **First impressions:** Dater opens the date by reacting to the avatar’s physical description, name, and (to a lesser degree) emotional state.
- **Justify:** Full-screen “Justify Your Opinion” takeover; player types one justification; return to date with dater saying something like “Do you want to explain that a little more?” then continue.
- **Reactions:** Dater responds via LLM using full personality, visible vs inferred context, reaction intensity, and “stuck on date” constraint. Sentiment from the reaction (loves/likes/dislikes/dealbreakers) drives compatibility updates.
- **Compatibility:** 5 factors, activation, weighted aggregate, drop lowest. Updated only when the dater reacts; optional compatibility reason in UI. Hidden dater values steer sentiment and factor deltas.
