# Bad Date Compatibility + Ratings Scoring Mode Spec

This document defines the standalone scoring design for the single-player daily mode currently implemented as **Likes Minus Dislikes + Ratings**.

The goal is to preserve dater personality and romantic stakes while rewarding entertaining, chaotic play that fits the "TV show" framing.

## **Compatibility + Ratings**

Compatibility + Ratings is a dual-track score model: the player is trying to win the date and make good television at the same time.

### Goals

- Keep the scoring loop clear and immediate on every player answer.
- Preserve strong character-roleplay and value-based reactions from the dater.
- Reward entertaining, non-dull play without requiring pure sabotage of compatibility.
- Produce end states that are more expressive than a single win/loss.
- Keep the system readable in real time with obvious visual feedback.

### Core Concept

The run tracks two separate meters:

- **Compatibility** (0 to 5)
- **Ratings** (0 to 5)

Both meters start at **0** and are updated on each scorable answer.

#### Compatibility Rules

- Every scorable player answer must be evaluated as exactly one of:
  - **Like** (Compatibility +1)
  - **Dislike** (Compatibility -1)
- Never both. Never neither.
- Compatibility is clamped each turn to **0..5**.
- No negative carry/debt is allowed. If Compatibility is at 0, additional dislikes do not push below 0.
- Evaluation must be grounded in the dater's character profile, values, ideal traits, and dealbreakers.
- Dislikes are negative-only. If a player condemns/rejects a negative trait, that should not count as a dislike hit.

#### Ratings Rules

- Each scorable answer also receives a **Ratings Effect**:
  - **Increase** (Ratings +1)
  - **Decrease** (Ratings -1)
  - **No Change** (Ratings +0)
- Ratings is clamped each turn to **0..5**.
- Ratings is judged on entertainment value, boldness, and non-dullness, not dater compatibility.
- The system should be relatively generous: if an answer is not dull, prefer **Increase**.

#### Scorable Turn Scope

- **Scored:** each main player answer during the date rounds.
- **Not scored:** initial impression/opening and non-answer follow-up/system lines.

### LLM Evaluation Contract

For each scorable answer, the scoring evaluator should return:

- `profileVerdict`: `like` or `dislike`
- `reactionPolarity`: `like` or `dislike`
- `matchedValue`: exact like/dislike label selected from that dater's configured lists
- `reason`: short explanation
- `ratingsEffect`: `increase` | `decrease` | `no_change`

Resolution behavior:

- If either verdict indicates negative alignment, treat the turn as a **Dislike** for Compatibility scoring.
- Ratings effect is applied independently of Compatibility.

### End-State Classification

Final outcome is determined from the two 0-5 meters:

- **Total Failure**: Compatibility <= 2 and Ratings <= 2
- **Successful TV Episode**: Ratings >= 3 and Compatibility <= 2
- **Successful Date**: Compatibility >= 3 and Ratings <= 2
- **Perfect Date**: Compatibility >= 3 and Ratings >= 3

Second-date decision in this mode is derived directly from Compatibility:

- **Yes** if Compatibility >= 3
- **No** if Compatibility <= 2

No separate freeform yes/no LLM decision is used for this mode.

### Player Experience

- Player selects this mode at the start of a run.
- During the date, both meters are shown as large vertical side meters:
  - left: **COMPATIBILITY**
  - right: **RATINGS**
- Real-time scoring feedback appears in the title bar.
  - Keep feedback concise and directional.
  - Do not include explicit trait names in popup text.
- End overlay and Results screen both show labeled **Compatibility** and **Ratings** bars.
- Results still include "what they liked / what backfired" hit lists for post-run understanding.

### Share Output

Share copy should emphasize the dual objective and outcome:

- Outcome label (Total Failure / Successful TV Episode / Successful Date / Perfect Date)
- Compatibility out of 5
- Ratings out of 5
- Second-date result (Yes/No)

#### Example Share Copy

I got a **Successful TV Episode** with Adam.

Compatibility: 2/5  
Ratings: 4/5  
Second Date: No

This format keeps social posts readable while still showing the core optimization challenge.
