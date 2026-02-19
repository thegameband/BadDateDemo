# Bad Date -- Project Breakdown (People Friendly)

*Last updated: Feb 18, 2026*

---

## So What Is This Thing?

Bad Date is a party game you play in your phone's web browser. Imagine going on the world's weirdest first date -- except you and your friends are the ones deciding what happens. You're basically building a person (called the "Avatar") and sending them on a date with a pre-made character (called the "Dater"). The goal? Try to get the Dater to actually like your Avatar by the end of the date. If you hit 80% compatibility or higher, it's a successful date. If you don't... well, it's a Bad Date.

You can play solo (just you) or with up to 20 friends in a live multiplayer room.

---

## How Do You Play?

Here's the step-by-step of what happens when you play:

1. **You open the game** -- It loads up in your browser. No app download needed.
2. **You pick Solo or Multiplayer** -- Solo means just you. Multiplayer means you create or join a room (using a room code or QR code) and play with friends.
3. **You meet the Dater** -- A bio page shows you who your date is. Their name, age, hobbies, a picture -- like a dating app profile. There are currently four Daters: Leo, Maya, Kickflip, and Adam. Each one has a totally different personality.
4. **You build your Avatar** -- The game asks you 3 questions about the person you're sending on the date: "How do you look?", "How are you feeling?", and "What is your name?" You type whatever you want. This is where it gets silly -- you could say you're a 7-foot-tall flamingo wearing a tuxedo if you want.
5. **The date starts** -- The Dater gives their first impression of your Avatar (based on how you described them). Then you go through 6 rounds of date questions.
6. **Each round** -- The game asks a question (like "What's your guilty pleasure?"), you (or your friends) type an answer, the Dater reacts. In multiplayer, everyone submits answers, you vote on the best one, and the winning answer gets used.
7. **Plot Twist!** -- After round 3, something crazy happens (like someone else hitting on your date) and you have to decide what to do about it.
8. **The date wraps up** -- After round 6, the Dater gives their final thoughts, you see highlights and lowlights, and you get your compatibility score.

---

## The Multiplayer Part

When playing with friends, it works like this:

- One person **hosts** the game and gets a room code.
- Everyone else **joins** by typing in the code or scanning a QR code on their phone.
- During each round, **everyone submits** an answer.
- Then **everyone votes** on which answer to use.
- The **winning answer** is what the Avatar says on the date.
- There's a live chat so players can react and joke around.

The multiplayer syncing happens through something called **PartyKit**, which is basically a service that keeps everyone's phones connected and in sync in real time using WebSockets (think of it like a group text chat, but for game data).

---

## The AI Stuff

Here's where it gets cool. The Dater's responses aren't pre-written scripts -- they're generated on the fly by an AI (specifically, Anthropic's Claude). When you say something on the date, the AI reads your answer, looks at the Dater's personality profile, and writes a response that sounds like that specific character.

Each Dater has a huge personality file: their backstory, values, what they love, what they hate, how they talk, how formal they are, how flirty they are -- dozens of traits. The AI uses all of this to stay in character.

There's also a **text-to-speech** system (using ElevenLabs) that reads the Dater's responses out loud, so it feels like you're actually listening to someone talk. If the ElevenLabs service isn't available, the game falls back to your browser's built-in text-to-speech.

If the AI service is down entirely, the game has backup responses so it still works -- it just won't be as dynamic.

---

## The Compatibility System

Think of compatibility like a score bar that starts at 50 out of 100.

- If the Dater **loves** what you said: +20 points
- If they **like** it: +5 points
- If they **dislike** it: -5 points
- If it's a **dealbreaker**: -20 points

The Dater decides how they feel based on their personality. Each Dater has hidden lists of things they love, like, dislike, and consider dealbreakers. The AI reads your answer, reacts in character, then rates how it made them feel -- and the score moves accordingly.

If your answer could go either way (the Dater both likes and dislikes something about it), the game checks the current score. If the date is going well (above 50), the Dater gives you the benefit of the doubt. If it's going badly, they're more harsh. But Love and Dealbreaker reactions always override this -- a dealbreaker is a dealbreaker no matter what.

---

## The Characters

There are 4 Daters right now:

- **Leo** -- Has his own vibe and personality traits
- **Maya** -- Different archetype, different reactions
- **Kickflip** -- Unique personality, different dealbreakers
- **Adam** -- Special: he talks in old English/romantic prose style. Completely different speech pattern from the others.

Each one has stats like chattiness, flirtatiousness, shyness, directness, and more. These stats shape how the AI writes their dialogue.

---

## How Is It Built? (The Simple Version)

The game is a **web app** -- it runs in your browser. Here's the tech in plain English:

- **React** is the framework that builds what you see on screen. It's like the engine that draws all the buttons, text, and animations.
- **Vite** is the tool that bundles everything together and runs the development server. Think of it like the oven that bakes all the ingredients into a finished website.
- **Zustand** is how the game remembers what's happening (what phase you're in, what the score is, what's been said). It's like the game's short-term memory.
- **Framer Motion** handles all the animations -- the swiping, the floating hearts, the confetti.
- **PartyKit** handles the multiplayer -- it's the phone line that keeps all the players connected.
- **Anthropic Claude** is the AI brain that writes the Dater's dialogue.
- **ElevenLabs** is the voice that reads the dialogue out loud.
- **DiceBear** generates the cartoon avatar portraits you see during the date.
- The whole thing is deployed on **Vercel**, which is a hosting service that puts websites on the internet.

---

## The File Structure (What's Where)

If you opened the project folder, here's what you'd see:

- **`src/`** -- All the actual game code
  - **`components/`** -- The visual pieces (lobby screen, date scene, results screen, etc.)
  - **`services/`** -- The behind-the-scenes workers (AI responses, voice, multiplayer connection, avatar portraits)
  - **`store/`** -- The game's memory (what phase, what score, what's been said)
  - **`data/`** -- The Dater character definitions
- **`partykit/`** -- The multiplayer server code
- **`prompts/`** -- The instructions given to the AI for how to respond
- **`docs/`** -- Design documents and breakdowns (like this one!)
- **`public/`** -- Static files (icons, etc.)
- **`scripts/`** -- Helper scripts for development tasks

---

## What Makes It Fun

The magic is in the chaos. You can say literally anything as your answer, and the AI-powered Dater will react to it in character. Say you're a sentient sandwich? The Dater will have opinions about that. Say your guilty pleasure is arson? The Dater will react accordingly (and it probably won't go well for your score).

In multiplayer, the fun comes from everyone competing to submit the funniest or most chaotic answer, then voting on which one actually gets said on the date. It's like a collaborative improv show where you're all writing the script for the world's worst date.
