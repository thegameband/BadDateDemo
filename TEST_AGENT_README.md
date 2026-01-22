# AI Test Agent for Bad Date Demo

This test agent simulates 3 players (1 host + 2 clients) playing through your multiplayer game and detects bugs, blank screens, and progression issues.

## What It Does

✅ **Automated Gameplay**
- Spawns 3 browser windows (1 host, 2 clients)
- Host creates a game room
- Clients join the room
- All 3 agents play through all 5 rounds
- Suggests attributes, votes, and progresses through phases

✅ **Bug Detection**
- **Blank screens** - Detects when pages fail to load content
- **Missing UI elements** - Reports when expected buttons/inputs are not found
- **Stuck states** - Identifies when the game stops progressing
- **Connection issues** - Logs when clients can't join or sync fails

✅ **Debugging Support**
- Saves screenshots when errors occur
- Logs detailed timestamps of all actions
- Keeps browsers open after test for manual inspection
- Generates comprehensive bug reports

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install Puppeteer (browser automation) and other required packages.

### 2. Run the Test Agent

```bash
npm run test-agent
```

Or directly:

```bash
node test-agent.js
```

## What to Expect

When you run the agent, you'll see:

1. **3 browser windows open** - One for the host, two for clients
2. **Real-time logs** in your terminal showing each agent's actions
3. **Agents playing the game** - Watch them navigate, suggest attributes, and vote
4. **Issue detection** - Any bugs will be logged with 🐛 emoji
5. **Screenshots** - Saved when errors occur (look for `debug-*.png` files)

## Understanding the Output

### Good Signs ✅
```
✅ [HOST] Clicked Live Mode
✅ [CLIENT1] Entered name: TestClient1
✅ [HOST] Room code: ABC123
✅ [CLIENT2] Submitted suggestion
```

### Issues to Investigate 🐛
```
🐛 [HOST] BUG [BLANK_SCREEN]: Page body is empty or too small
🐛 [CLIENT1] BUG [ELEMENT_MISSING]: Element "button" not found after 10000ms
🐛 [CLIENT2] BUG [STUCK]: Round 3: Game appears stuck, no progression detected
```

### What Each Bug Means

| Bug Type | What It Means | What to Check |
|----------|---------------|---------------|
| `BLANK_SCREEN` | The page loaded but has no visible content | Check for JavaScript errors, broken builds, or missing assets |
| `ELEMENT_MISSING` | Expected UI element not found | Check if the component is rendering, CSS might be hiding it, or wrong selector |
| `NO_CONTENT` | Page has very little text | Component might have crashed or data isn't loading |
| `STUCK` | Game stopped progressing | Check PartyKit sync, timer logic, or phase transitions |
| `INPUT_MISSING` | Can't find the suggestion input | Phase 1 UI might not be rendering correctly |
| `NO_RESULTS` | Results screen didn't appear | Game might have crashed before completion |

## Debugging Tips

### If you see blank screens:
1. Check the screenshot saved as `debug-<agent>-<timestamp>.png`
2. Open the browser window (stays open after test)
3. Open DevTools Console (F12) to see JavaScript errors
4. Check Network tab for failed requests

### If clients can't join:
1. Look for the host's room code in the logs
2. Check if PartyKit is configured correctly (VITE_PARTYKIT_HOST in `.env`)
3. Verify the room code extraction logic works with your UI
4. Check browser console for PartyKit connection errors

### If the game gets stuck:
1. Check which phase it stuck on (suggestion, voting, or conversation)
2. Check browser console for PartyKit state sync logs
3. Check browser console for errors
4. Verify timers are advancing correctly

## Configuration

You can modify the agent behavior by editing `test-agent.js`:

```javascript
const GAME_URL = 'https://bad-date-demo.vercel.app/' // Change to test locally
const HEADLESS = false // Set to true to hide browser windows
```

**Testing locally:**
```javascript
const GAME_URL = 'http://localhost:5173/'
```

**Running headless (no UI):**
```javascript
const HEADLESS = true // Faster, but you can't watch it play
```

## Common Issues

### "Error: Could not find Chrome"
Puppeteer needs Chrome/Chromium installed. It usually downloads it automatically. If not:
```bash
npx puppeteer browsers install chrome
```

### "Room code not found"
The agent tries to auto-detect the room code from your UI. If it fails, you'll see:
```
⚠️  [HOST] Could not find room code automatically
```
A screenshot will be saved so you can see what the UI looked like. You may need to update the room code detection logic in the `runHostAgent` function to match your UI.

### Agents move too fast
Add delays by increasing `setTimeout()` values in the code.

### False positives
If the agent reports bugs that aren't actually bugs, the detection logic might need tuning for your specific UI. Check the selectors and adjust as needed.

## Advanced Usage

### Testing Different Scenarios

**Test with more attributes:**
```javascript
// In main(), before starting the game:
for (let round = 1; round <= 10; round++) { // Change from 5 to 10
  // ...
}
```

**Test edge cases:**
```javascript
// Modify generateAttribute() to return specific test cases:
function generateAttribute() {
  return [
    'has a name with special chars: @#$%',
    'description that is extremely long '.repeat(20),
    'contains emoji 🔥💀👻',
  ][Math.floor(Math.random() * 3)]
}
```

### Running Multiple Tests in Sequence

Create a bash script to run multiple tests:
```bash
#!/bin/bash
for i in {1..5}; do
  echo "Test run #$i"
  node test-agent.js
  sleep 5
done
```

## Troubleshooting

**All browsers get stuck at the same point?**
- Likely a game bug, not a test agent issue
- Check that specific UI state in your game code

**Only one client gets stuck?**
- Could be a race condition or PartyKit sync issue
- Check event ordering and debouncing

**Works locally but fails on Vercel?**
- Change `GAME_URL` to your local server
- Compare behavior to identify deployment issues

## Next Steps

After running the agent and finding bugs:

1. **Review the terminal output** - Look for 🐛 bugs and ⚠️ warnings
2. **Check screenshots** - See exactly what the agent saw when it failed
3. **Inspect browser state** - The windows stay open, so you can interact with them
4. **Fix issues** - Use the bug logs to identify and fix problems
5. **Re-run the test** - Verify your fixes worked

## Questions?

The test agent follows the same flow described in `AI_AGENT_PLAYGUIDE.txt`. If you need to customize the agent's behavior, refer to that guide and update the agent logic accordingly.

Happy testing! 🎮🐛✨
