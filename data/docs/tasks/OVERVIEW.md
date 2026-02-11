# Implementation plan: Main-mode updates

**Design:** `docs/SINGLE_PLAYER_DAILY_DESIGN.md`.

**Goals:** (1) No timers, direct answer, no wheel, verbose dater [Tasks 1–4, done]. (2) No chat window — single answer input only. (3) Justify as full-screen takeover with “Justify Your Opinion” then dater says “Do you want to explain that a little more?” (4) Create Your Dater: 3 questions only (look, feeling, name), no timer.

---

## Canonical flow (verify in build)

1. **Play** – Player presses Play; no name entry.
2. **Dater Bio Page** – Image + age, gender, occupation, hobbies (from dater personality); **START THE DATE** button.
3. **3 questions** – “How do you look?”, “How are you feeling?”, “What is your name?” (one by one, no timer).
4. **Date begins** – Dater offers **first impressions** of the avatar (physical, name, emotional state).
5. **Rounds 1–6** – Game asks question → player answers → dater responds (repeat).
6. **Wrap up** – Dater sums up how the date went and their impression.
7. **Date Review** – Highlights and lowlights, what the dater thought (existing).
8. **Score** – Compatibility % (existing).

---

## Task 1: Remove all phase and plot-twist timers

**What:** Remove or bypass every countdown timer in the date flow. Progression is only: player submits answer → dater reacts (and optional Justify) → advance to next round when reaction is done.

**Where:** `src/components/LiveDateScene.jsx`, `src/store/gameStore.js`.

**Details:**
- Phase timer (e.g. 30/45s for phase1/phase2): remove countdown; advance when the host/player has submitted and the dater has finished reacting.
- Plot Twist timer: remove; advance on “Continue” or when Plot Twist reaction is done.
- Starting-stats timer (if still used): remove or make optional; advance when ready.
- Clear any `setInterval` / `phaseTimerRef` that decrements time; remove `phaseTimer === 0` transition logic that forces phase end by time.
- In gameStore, `phaseTimer` can remain in state for sync but should no longer drive transitions.

**Dependencies:** None. Do first.

---

## Task 2: Remove the answer wheel; accept direct player text as the answer

**What:** Remove the wheel (answer selection / slices / spinning). The only path to “submit an answer” is the player typing (or pasting) text and submitting. Whatever they submit is the answer for that round.

**Where:** `src/components/LiveDateScene.jsx` (and any UI that shows the wheel).

**Details:**
- Remove or bypass `answerSelection` state and all wheel UI (slices, spin, winner).
- Remove logic that groups or selects among multiple player submissions (e.g. `groupSimilarAnswers`, wheel slice selection). Single player: one submitted string per round.
- Ensure the round’s “current answer” passed to the dater reaction is exactly the player’s submitted text (and that the round question is passed too — see Task 3).
- If Phase 1 currently collects multiple “suggested” answers and then runs the wheel, change to: show one text input; on submit, that string is the answer and triggers dater reaction immediately (no timer, no wheel).

**Dependencies:** None. Can be done in parallel with Task 1.

---

## Task 3: Ensure question + answer are always passed to the LLM

**What:** Whenever the dater reacts to the player’s answer, the LLM must receive both the **round question** and the **player’s answer**. This is critical for short answers (e.g. one word) so the dater has context (e.g. “What’s your guilty pleasure?” + “Cheese”).

**Where:** `src/components/LiveDateScene.jsx`, `src/services/llmService.js`.

**Details:**
- `getDaterResponseToPlayerAnswer(dater, question, playerAnswer, ...)` already exists and takes question + playerAnswer. Ensure every code path that triggers a dater reaction after the player answers uses this (or equivalent) and passes the **current round question** (e.g. `currentRoundPrompt.subtitle` or the prompt text for this round) and the **exact player-submitted string**.
- Audit call sites: pre-generate path, live path, any fallback. No path should call the LLM with only `playerAnswer` when a question exists for the round.
- In `llmService.js`, keep or add prompt text that states the question and the answer so the model sees both (already present in `getDaterResponseToPlayerAnswer`; verify and keep).

**Dependencies:** Task 2 (so the “answer” is unambiguously the single submitted text). Can be done after or with Task 2.

---

## Task 4: Allow dater to be slightly more verbose

**What:** Update the dater response instructions so the dater may give slightly longer replies (e.g. 2–4 sentences) when it fits, since they are the only one speaking.

**Where:** `src/services/llmService.js` (prompts for `getDaterResponseToPlayerAnswer` and any other dater reaction that’s shown to the player).

**Details:**
- Change “Keep it 1–2 short sentences” (or similar) to allow 2–4 sentences when natural; avoid making every response an essay.
- Preserve “dialogue only, no action tags” and “in character.” Optionally add a line like “You’re the only one speaking, so you can be a bit more expressive when it fits the moment.”

**Dependencies:** None. Can be done anytime.

---

## Order

1. **Task 1** – Remove timers (unblocks clean turn-based flow).
2. **Task 2** – Remove wheel; single text input and submit as the only answer path.
3. **Task 3** – Verify question + answer always passed to LLM (aligns with Task 2).
4. **Task 4** – Dater verbosity (independent).

After completion, run through a full date: no countdowns, type an answer (including a single word) and confirm the dater’s reply is contextual and reasonably verbose where appropriate.

---

## Task 5: Single answer input only (no chat window)

**What:** In date mode, remove or hide the **chat window** (player chat log / list of messages). Show only a **single text input field** (and submit) for the player to answer the current question. No scrolling chat history; input is the only persistent UI for typing.

**Where:** `src/components/LiveDateScene.jsx` (and related CSS).

**Details:**
- Hide or remove the area that displays `playerChat` / “Chat with other players” and the list of submitted messages during the date.
- Keep the one text input (and submit button) that the player uses to submit their answer for each round.
- Optional: keep a minimal “You said: [last answer]” or nothing; design says “just a text input” for answers.

**Dependencies:** None.

---

## Task 6: Justify — full-screen takeover and dater follow-up

**What:** When the dater hates or is confused by what was said, trigger **Justify** as a **full-screen takeover**: screen shows **“Justify Your Opinion”** (or equivalent). Player types one justification and submits. Then **return to the date** and the dater says something like *“Do you want to explain that a little more?”* (or similar in-character line) before/after the justification is considered. Then continue the round (dater’s reaction to justification, then advance).

**Where:** `src/components/LiveDateScene.jsx`, `src/services/llmService.js` (if dater follow-up line is LLM vs canned).

**Details:**
- Replace or augment the current Justify UI so it is **full-screen** and dominant (e.g. overlay that covers the scene, title “Justify Your Opinion”, single input + submit).
- On submit: dismiss full-screen, return to date view; show dater line like “Do you want to explain that a little more?” (can be canned or LLM). Then run existing justification flow (LLM reacts to justification) and advance when done.
- No timer on the Justify screen.

**Dependencies:** None.

---

## Task 7: Create Your Dater — 3 questions, no timer

**What:** Bring back the **Create Your Dater** (avatar-building) opening flow. Ask the player **exactly 3 questions**, in order: (1) **“How do you look?”** (2) **“How are you feeling?”** (3) **“What is your name?”** No timer; only the player answers; advance on submit to next question (or to match screen after Q3).

**Where:** Entry flow before match (e.g. `LiveDateScene.jsx` or a dedicated component), `src/store/gameStore.js` (starting-stats or equivalent state).

**Details:**
- If the current “starting-stats” flow exists with 6 questions and timers, replace or add a **3-question only** mode: fixed questions above, no countdown, single text input per question. Store answers as avatar physical (look), emotional (feeling), and name.
- After the 3rd answer, transition to match screen (or to “Start date” if match is skipped in dev). Ensure avatar state (name, attributes from look/feeling) is set for the date.
- No timer; no other players; progression is submit → next question or finish.

**Dependencies:** None. Can be done in parallel with Task 5 or 6.

---

## Order (new tasks)

5. **Task 5** – Single answer input only (no chat window in date mode).
6. **Task 6** – Justify full-screen takeover + dater “explain that a little more?” line.
7. **Task 7** – Create Your Dater: 3 questions (look, feeling, name), no timer.
