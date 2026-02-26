# Bad Date Scoring Systems Proposal

This document proposes three scoring models for the Bad Date daily experience. The goal is to keep Bad Date funny, replayable, and easy to understand, while creating outcomes players want to post and compare.

## **Likes Minus Dislikes**

Likes Minus Dislikes is a clean fallback model: easy to explain, forgiving to play, and stable for daily use.

### Goals

- Give players a clear, low-friction score loop.  
- Keep most daily outcomes feeling successful.  
- Preserve dater personality without requiring complex scoring logic.  
- Ensure results are easy to compare with friends.

### Core Concept

Each dater has a hidden preference list made of:

- **6 Likes**  
- **4 Dislikes**

Every hit is worth one point. Final daily score is based on the net of Likes and Dislikes:

- Score \= Likes Hit \- Dislikes Hit  
- Maximum daily score is 5, displayed as a 0/5 rating on the end screen. Net results of greater than 5 still result in a daily score of 5/5.

This system ensures that as long as the player is hitting a majority of the Dater’s Likes, they will achieve a good score for the day. Exact numbers of likes and dislikes can be tuned to get exactly the player experience we want.

### Player Experience

- The player answers six date questions as usual.  
- The dater reacts in character.  
- Behind the scenes, answers trigger hidden likes/dislikes and displays them to the player in real time in the UI  
- End screen shows:  
  - Daily score (out of 5\)  
  - A "what they liked / what backfired" T-chart  
  - Final dater decision (Yes/No)

### Share Output

Share text should be compact and readable:

- Daily score out of 5  
- Dater outcome (Yes/No)  
- Short flavor tag ("Messy but charming", "Shockingly compatible")

## **Bad Date Bingo**

Bad Date Bingo turns scoring into a viral board game pattern: fill cells, avoid lockouts, chase Bingos.

### Goals

- Create a highly visual, inherently shareable scoring mode.  
- Make Likes and Dislikes *all* into tests for the player to either succeed or fail  
- Make each answer feel like it gives the player meaningful information about future answers  
- Provide both an achievable daily goal and a large space above that for flexing on your friends  
- Encourage daily participation through the variety of possible game state outcomes, not LLM entertainment alone

### Core Concept

Each dater profile includes:

- **8 Likes**  
- **8 Dislikes**

These are assigned to a hidden **4x4 bingo board**. The player can see the board structure but not the cell contents at the start. The Bingo board layout is exactly the same for every player on a given day.

When the Agent is producing its reaction to the player’s input, it also evaluates a list of its likes and dislikes, returning one of the following three values for each:

- **Filled In** (Player behavior agrees with Like or Dislike, permanently filled, contents revealed)  
- **Locked Out** (Player behavior clashes with Like or Dislike; permanently blocked, contents revealed)  
- **Neutral** (no change)

The player's goal is to complete at least one Bingo (row, column, diagonal) within the six-question date.

### Player Experience

- The board is visible throughout the date.  
- New fills/locks reveal trait text as they occur.  
- End screen highlights:  
  - Number of squares filled  
  - Number of bingos achieved  
  - Reveal of any remaining blank squares  
  - Final dater decision (Yes/No)

### Share Output

Share should use a spoiler-light emoji grid:

- Filled, locked, neutral states as colored squares  
- Text summary with:  
  - total filled cells  
  - total bingos  
  - dater outcome (Yes/No)

#### Example Share Copy

I got **2** Bad Date Bingos with **Frankenstein’s Monster**\!

⬜🟩🟩🟥  
🟩🟩🟥⬜  
🟩🟩🟩🟩 **\< BINGO 1**  
🟥🟩⬜🟥  
      **^ BINGO 2**

This format is ideal for social feeds and easy friend comparison.

## **Compatibility x Daring**

Compatibility x Daring is a dual-track score chase: build attraction while pushing risky, chaotic energy for multiplier value.

### Goals

- Create a higher skill ceiling for players who want to optimize.  
- Preserve a strong "date fantasy" core (compatibility still matters most).  
- Make bold/funny play an explicit requirement of getting a good score, but not at the total cost of having a compatible date  
- Generate high-variance, brag-worthy score outcomes for sharing and meaningful daily leaderboards

### Core Concept

The run tracks two values, both shown to the player on showy UI elements:

- **Compatibility**, starting at **0**  
- **Daring**, starting at **1.0**

The Dater profile still comes with a list of 5 Likes and 5 Dislikes, but only for the LLM model to evaluate Compatibility.

During the date:

- Compatibility rises when answers land well and falls when they backfire, up to **±5 per answer** depending on the strength of the compatibility or lack thereof  
- Daring moves up or down up to **±0.5x per answer** based on how chaotic or overly safe the player's choices are.  
- Daring stays within a constrained range (**0.5x to 3.0x**).

Final score:

- **Final Score \= Compatibility x Daring**

This creates a **push-your-luck** scoring loop:

- Play too safe and the multiplier stays low.  
- Go too wild and compatibility can collapse.  
- The best runs maximize compatibility while sustaining high daring.

### Player Experience

- Per round, player gets lightweight feedback on:  
  - compatibility direction  
  - daring direction  
- End screen shows:  
  - final score  
  - compatibility value  
  - daring multiplier  
  - final dater decision (Yes/No)

### Share Output

Share should emphasize both performance and outcome:

- Final score (hero number)  
- Dater decision (Yes/No)

This gives players a clean competitive stat while keeping the romantic/comedic result front and center.