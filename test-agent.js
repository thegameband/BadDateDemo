/**
 * AI Multi-Player Test Agent for Bad Date Demo
 *
 * This agent:
 * - Spawns 3 browser instances (1 host + 2 clients)
 * - Plays through the game following the playguide
 * - Detects blank screens, UI freezes, and progression issues
 * - Logs detailed debugging information
 *
 * Usage:
 *   npm install puppeteer
 *   node test-agent.js
 */

import puppeteer from 'puppeteer'
import { setTimeout } from 'timers/promises'

const GAME_URL = 'https://bad-date-demo.vercel.app/'
const HEADLESS = false // Set to true to hide browser windows

// Issue tracking
const issues = []
let hostUsername = 'TestHost' // Track host name for room browser

const log = {
  info: (agent, msg) => console.log(`ℹ️  [${agent}] ${msg}`),
  success: (agent, msg) => console.log(`✅ [${agent}] ${msg}`),
  warning: (agent, msg) => console.log(`⚠️  [${agent}] ${msg}`),
  error: (agent, msg) => {
    console.log(`❌ [${agent}] ${msg}`)
    issues.push({ agent, type: 'ERROR', message: msg, timestamp: new Date() })
  },
  bug: (agent, category, details) => {
    const msg = `BUG [${category}]: ${details}`
    console.log(`🐛 [${agent}] ${msg}`)
    issues.push({ agent, type: category, message: details, timestamp: new Date() })
  },
  action: (agent, action) => console.log(`🎮 [${agent}] ${action}`),
}

/**
 * Check if page is blank or frozen
 */
async function detectBlankScreen(page, agentName) {
  try {
    // Check if body exists and has content
    const bodyHTML = await page.evaluate(() => document.body?.innerHTML || '')

    if (!bodyHTML || bodyHTML.trim().length < 100) {
      log.bug(agentName, 'BLANK_SCREEN', 'Page body is empty or too small')
      return true
    }

    // Check if main app container exists
    const hasAppContainer = await page.evaluate(() => {
      return document.querySelector('.app') !== null ||
             document.querySelector('#root') !== null ||
             document.querySelector('main') !== null
    })

    if (!hasAppContainer) {
      log.bug(agentName, 'MISSING_UI', 'No app container found in DOM')
      return true
    }

    // Check if there's visible text content
    const visibleText = await page.evaluate(() => document.body?.innerText || '')
    if (visibleText.trim().length < 20) {
      log.bug(agentName, 'NO_CONTENT', 'No visible text content on page')
      return true
    }

    return false
  } catch (error) {
    log.error(agentName, `Error checking for blank screen: ${error.message}`)
    return true
  }
}

/**
 * Wait for element with timeout and error handling
 */
async function waitForElement(page, selector, agentName, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout, visible: true })
    return true
  } catch (error) {
    log.bug(agentName, 'ELEMENT_MISSING', `Element "${selector}" not found after ${timeout}ms`)

    // Take screenshot for debugging
    const timestamp = Date.now()
    const screenshotPath = `./debug-${agentName}-${timestamp}.png`
    await page.screenshot({ path: screenshotPath, fullPage: true })
    log.info(agentName, `Screenshot saved: ${screenshotPath}`)

    // Log current page state
    const url = page.url()
    const title = await page.title()
    log.info(agentName, `Current URL: ${url}`)
    log.info(agentName, `Page title: ${title}`)

    return false
  }
}

/**
 * Generate creative attribute suggestions
 */
function generateAttribute() {
  const attributes = [
    'is a vampire',
    'loves murder',
    'has three heads',
    'is literally on fire',
    'is 100 feet tall',
    'has tentacles instead of arms',
    'eats people for fun',
    'is made of cheese',
    'secretly a robot',
    'can only speak in rhymes',
    'is always screaming internally',
    'has no bones',
    'is a wanted criminal',
    'is actually 500 years old',
    'collects human teeth',
  ]
  return attributes[Math.floor(Math.random() * attributes.length)]
}

/**
 * HOST Agent: Creates the game and starts it
 */
async function runHostAgent() {
  const agentName = 'HOST'
  let browser, page

  try {
    log.info(agentName, 'Starting browser...')
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    // Step 1: Load game
    log.action(agentName, 'Loading game URL...')
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' })
    await setTimeout(1000)

    // Check for blank screen
    if (await detectBlankScreen(page, agentName)) {
      return { success: false, reason: 'Blank screen at main menu' }
    }

    // Step 2: Click Live Mode
    log.action(agentName, 'Looking for Live Mode button...')
    const liveModeFound = await waitForElement(page, 'button', agentName, 5000)
    if (!liveModeFound) {
      return { success: false, reason: 'Live Mode button not found' }
    }

    // Find and click the Live Mode button (look for text containing "Live")
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const liveButton = buttons.find(btn =>
        btn.textContent.includes('Live') || btn.textContent.includes('📺')
      )
      if (liveButton) liveButton.click()
    })
    log.success(agentName, 'Clicked Live Mode')
    await setTimeout(1500)

    // Check for blank screen after navigation
    if (await detectBlankScreen(page, agentName)) {
      return { success: false, reason: 'Blank screen after clicking Live Mode' }
    }

    // Step 3: Enter name
    log.action(agentName, 'Entering username...')
    const nameInputFound = await waitForElement(page, 'input[type="text"], input[placeholder*="name" i]', agentName)
    if (!nameInputFound) {
      return { success: false, reason: 'Name input field not found' }
    }

    await page.type('input[type="text"], input[placeholder*="name" i]', hostUsername)
    log.success(agentName, `Entered name: ${hostUsername}`)
    await setTimeout(500)

    // Step 4: Click "Host a Date"
    log.action(agentName, 'Clicking Host a Date...')
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const hostButton = buttons.find(btn =>
        btn.textContent.includes('Host') || btn.textContent.includes('✨')
      )
      if (hostButton) hostButton.click()
    })
    log.success(agentName, 'Clicked Host a Date')
    await setTimeout(1500)

    // Step 5: Click "Create Room"
    log.action(agentName, 'Creating room...')
    const createRoomFound = await waitForElement(page, 'button', agentName, 5000)
    if (!createRoomFound) {
      return { success: false, reason: 'Create Room button not found' }
    }

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const createButton = buttons.find(btn =>
        btn.textContent.includes('Create Room') || btn.textContent.includes('🎬')
      )
      if (createButton) createButton.click()
    })
    log.success(agentName, 'Clicked Create Room')
    await setTimeout(2000)

    // Check for blank screen in lobby
    if (await detectBlankScreen(page, agentName)) {
      return { success: false, reason: 'Blank screen in game lobby' }
    }

    // Step 6: Wait for clients to join (room is now visible in browser)
    log.info(agentName, 'Waiting for clients to join...')
    await setTimeout(20000) // Give clients time to join (increased to 20 seconds)

    // Step 7: Start the date
    log.action(agentName, 'Starting the date...')
    const startButtonFound = await waitForElement(page, 'button', agentName, 5000)
    if (!startButtonFound) {
      return { success: false, reason: 'Start button not found' }
    }

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const startButton = buttons.find(btn =>
        btn.textContent.includes('Start') || btn.textContent.includes('🎬')
      )
      if (startButton) startButton.click()
    })
    log.success(agentName, 'Clicked Start Date')
    await setTimeout(2000)

    // Check for blank screen after starting
    if (await detectBlankScreen(page, agentName)) {
      return { success: false, reason: 'Blank screen after starting date' }
    }

    // Step 8: Play through rounds
    log.info(agentName, 'Starting gameplay...')
    for (let round = 1; round <= 5; round++) {
      log.info(agentName, `\n=== ROUND ${round} ===`)

      // PHASE 1: Suggest attribute
      log.action(agentName, 'Phase 1: Suggesting attribute...')
      const inputFound = await waitForElement(page, 'input[placeholder*="answer" i], input[type="text"]', agentName, 15000)
      if (!inputFound) {
        log.bug(agentName, 'INPUT_MISSING', `Round ${round}: Cannot find suggestion input`)
        continue
      }

      const attribute = generateAttribute()
      await page.type('input[placeholder*="answer" i], input[type="text"]', attribute)
      log.action(agentName, `Typed: "${attribute}"`)
      await setTimeout(300)

      // Submit suggestion
      await page.keyboard.press('Enter')
      log.success(agentName, 'Submitted suggestion')

      // PHASE 2: Wait for voting phase to start (detect when voting UI appears)
      log.action(agentName, 'Phase 2: Waiting for voting to start...')

      let votingStarted = false
      let attempts = 0
      const maxAttempts = 40 // 20 seconds max wait

      // Poll for voting UI to appear
      while (!votingStarted && attempts < maxAttempts) {
        votingStarted = await page.evaluate(() => {
          // Check if voting UI is present
          const buttons = Array.from(document.querySelectorAll('button'))
          const hasVoteButtons = buttons.some(btn => /^[1-9]$/.test(btn.textContent.trim()))

          if (hasVoteButtons) return true

          // Or check for vote input field
          const inputs = Array.from(document.querySelectorAll('input'))
          const hasVoteInput = inputs.some(input =>
            input.type === 'text' &&
            input.offsetParent !== null &&
            !input.disabled &&
            input.placeholder?.toLowerCase().includes('vote')
          )

          return hasVoteInput
        })

        if (!votingStarted) {
          await setTimeout(500)
          attempts++
        }
      }

      if (!votingStarted) {
        log.warning(agentName, 'Voting UI never appeared')
      } else {
        log.success(agentName, 'Voting phase started!')

        // Now cast the vote
        const voteSuccess = await page.evaluate(() => {
          // Option 1: Look for numbered buttons to click
          const buttons = Array.from(document.querySelectorAll('button'))
          const numberButton = buttons.find(btn => /^[1-9]$/.test(btn.textContent.trim()))
          if (numberButton) {
            numberButton.click()
            console.log('Clicked vote button:', numberButton.textContent)
            return true
          }

          // Option 2: Look for an input field to type a vote number
          const inputs = Array.from(document.querySelectorAll('input'))
          const voteInput = inputs.find(input =>
            input.type === 'text' &&
            input.offsetParent !== null && // visible
            !input.disabled
          )
          if (voteInput) {
            voteInput.focus()
            voteInput.value = '1' // Vote for option 1
            voteInput.dispatchEvent(new Event('input', { bubbles: true }))
            voteInput.dispatchEvent(new Event('change', { bubbles: true }))
            // Press Enter to submit
            voteInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
            console.log('Entered vote number in input field')
            return true
          }

          return false
        })

        if (voteSuccess) {
          log.success(agentName, 'Cast vote')
        } else {
          log.warning(agentName, 'Could not cast vote')
        }
      }

      // PHASE 3: Watch conversation
      log.action(agentName, 'Phase 3: Watching conversation...')
      await setTimeout(5000) // Wait for conversation to play out

      // Check if we progressed
      const hasProgressed = await page.evaluate(() => {
        const text = document.body.innerText
        return text.includes('Phase') || text.includes('Round') || text.length > 1000
      })

      if (!hasProgressed) {
        log.bug(agentName, 'STUCK', `Round ${round}: Game appears stuck, no progression detected`)
      }
    }

    log.success(agentName, 'Completed all 5 rounds!')

    // Wait for results screen
    log.action(agentName, 'Waiting for results...')
    await setTimeout(5000)

    // Check for results
    const hasResults = await page.evaluate(() => {
      const text = document.body.innerText
      return text.includes('Result') || text.includes('compatibility') || text.includes('%')
    })

    if (!hasResults) {
      log.bug(agentName, 'NO_RESULTS', 'Results screen not displayed')
    } else {
      log.success(agentName, 'Results screen reached!')
    }

    return { success: true }

  } catch (error) {
    log.error(agentName, `Fatal error: ${error.message}`)
    console.error(error)
    return { success: false, reason: error.message }
  } finally {
    // Keep browser open for inspection
    log.info(agentName, 'Browser staying open for inspection...')
  }
}

/**
 * CLIENT Agent: Joins the host's game
 */
async function runClientAgent(clientNumber) {
  const agentName = `CLIENT${clientNumber}`
  let browser, page

  try {
    log.info(agentName, 'Starting browser...')
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    // Step 1: Load game
    log.action(agentName, 'Loading game URL...')
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' })
    await setTimeout(1000)

    // Check for blank screen
    if (await detectBlankScreen(page, agentName)) {
      return { success: false, reason: 'Blank screen at main menu' }
    }

    // Step 2: Click Live Mode
    log.action(agentName, 'Looking for Live Mode button...')
    await waitForElement(page, 'button', agentName, 5000)

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const liveButton = buttons.find(btn =>
        btn.textContent.includes('Live') || btn.textContent.includes('📺')
      )
      if (liveButton) liveButton.click()
    })
    log.success(agentName, 'Clicked Live Mode')
    await setTimeout(1500)

    // Step 3: Enter name
    log.action(agentName, 'Entering username...')
    await waitForElement(page, 'input[type="text"]', agentName)
    await page.type('input[type="text"]', `TestClient${clientNumber}`)
    log.success(agentName, `Entered name: TestClient${clientNumber}`)
    await setTimeout(500)

    // Step 4: Click "Join a Date"
    log.action(agentName, 'Opening room browser...')
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const joinButton = buttons.find(btn =>
        btn.textContent.includes('Join') || btn.textContent.includes('🔗')
      )
      if (joinButton) joinButton.click()
    })
    log.success(agentName, 'Clicked Join a Date')
    await setTimeout(2000)

    // Step 5: Find and click host's room from browser
    log.action(agentName, 'Looking for room in browser...')

    // Wait for room browser to load
    await setTimeout(2000) // Give rooms time to populate

    // Click on the topmost Room button
    const roomClicked = await page.evaluate(() => {
      // Find all buttons on the page
      const buttons = Array.from(document.querySelectorAll('button'))

      // Look for buttons that contain "Room" text (case insensitive)
      const roomButtons = buttons.filter(btn =>
        btn.textContent.toLowerCase().includes('room') &&
        btn.offsetParent !== null // visible
      )

      if (roomButtons.length > 0) {
        // Click the first (topmost) room button
        roomButtons[0].click()
        console.log('Clicked room button:', roomButtons[0].textContent)
        return true
      }

      console.log('No room buttons found. All buttons:', buttons.map(b => b.textContent))
      return false
    })

    if (!roomClicked) {
      log.error(agentName, 'Could not find any room buttons in browser')
      await page.screenshot({ path: `./debug-no-room-${agentName}.png`, fullPage: true })
      return { success: false, reason: 'No room buttons found in browser' }
    }

    log.success(agentName, 'Clicked on room')
    await setTimeout(3000)

    // Check for blank screen in lobby
    if (await detectBlankScreen(page, agentName)) {
      return { success: false, reason: 'Blank screen after joining' }
    }

    // Step 6: Wait for host to start
    log.info(agentName, 'Waiting for host to start the game...')
    await setTimeout(5000)

    // Step 7: Play through rounds (same as host)
    log.info(agentName, 'Starting gameplay...')
    for (let round = 1; round <= 5; round++) {
      log.info(agentName, `\n=== ROUND ${round} ===`)

      // PHASE 1: Suggest attribute
      log.action(agentName, 'Phase 1: Suggesting attribute...')
      const inputFound = await waitForElement(page, 'input[placeholder*="answer" i], input[type="text"]', agentName, 15000)
      if (!inputFound) {
        log.bug(agentName, 'INPUT_MISSING', `Round ${round}: Cannot find suggestion input`)
        continue
      }

      const attribute = generateAttribute()
      await page.type('input[placeholder*="answer" i], input[type="text"]', attribute)
      log.action(agentName, `Typed: "${attribute}"`)
      await setTimeout(300)

      await page.keyboard.press('Enter')
      log.success(agentName, 'Submitted suggestion')

      // PHASE 2: Wait for voting phase to start (detect when voting UI appears)
      log.action(agentName, 'Phase 2: Waiting for voting to start...')

      let votingStarted = false
      let attempts = 0
      const maxAttempts = 40 // 20 seconds max wait

      // Poll for voting UI to appear
      while (!votingStarted && attempts < maxAttempts) {
        votingStarted = await page.evaluate(() => {
          // Check if voting UI is present
          const buttons = Array.from(document.querySelectorAll('button'))
          const hasVoteButtons = buttons.some(btn => /^[1-9]$/.test(btn.textContent.trim()))

          if (hasVoteButtons) return true

          // Or check for vote input field
          const inputs = Array.from(document.querySelectorAll('input'))
          const hasVoteInput = inputs.some(input =>
            input.type === 'text' &&
            input.offsetParent !== null &&
            !input.disabled &&
            input.placeholder?.toLowerCase().includes('vote')
          )

          return hasVoteInput
        })

        if (!votingStarted) {
          await setTimeout(500)
          attempts++
        }
      }

      if (!votingStarted) {
        log.warning(agentName, 'Voting UI never appeared')
      } else {
        log.success(agentName, 'Voting phase started!')

        // Now cast the vote
        const voteSuccess = await page.evaluate(() => {
          // Option 1: Look for numbered buttons to click
          const buttons = Array.from(document.querySelectorAll('button'))
          const numberButton = buttons.find(btn => /^[1-9]$/.test(btn.textContent.trim()))
          if (numberButton) {
            numberButton.click()
            console.log('Clicked vote button:', numberButton.textContent)
            return true
          }

          // Option 2: Look for an input field to type a vote number
          const inputs = Array.from(document.querySelectorAll('input'))
          const voteInput = inputs.find(input =>
            input.type === 'text' &&
            input.offsetParent !== null && // visible
            !input.disabled
          )
          if (voteInput) {
            voteInput.focus()
            voteInput.value = '1' // Vote for option 1
            voteInput.dispatchEvent(new Event('input', { bubbles: true }))
            voteInput.dispatchEvent(new Event('change', { bubbles: true }))
            // Press Enter to submit
            voteInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
            console.log('Entered vote number in input field')
            return true
          }

          return false
        })

        if (voteSuccess) {
          log.success(agentName, 'Cast vote')
        } else {
          log.warning(agentName, 'Could not cast vote')
        }
      }

      // PHASE 3: Watch conversation
      log.action(agentName, 'Phase 3: Watching conversation...')
      await setTimeout(5000)

      const hasProgressed = await page.evaluate(() => {
        const text = document.body.innerText
        return text.includes('Phase') || text.includes('Round') || text.length > 1000
      })

      if (!hasProgressed) {
        log.bug(agentName, 'STUCK', `Round ${round}: Game appears stuck, no progression detected`)
      }
    }

    log.success(agentName, 'Completed all 5 rounds!')
    await setTimeout(5000)

    return { success: true }

  } catch (error) {
    log.error(agentName, `Fatal error: ${error.message}`)
    console.error(error)
    return { success: false, reason: error.message }
  } finally {
    log.info(agentName, 'Browser staying open for inspection...')
  }
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('🎮 BAD DATE DEMO - MULTI-PLAYER TEST AGENT')
  console.log('='.repeat(70) + '\n')

  log.info('SYSTEM', 'Starting test with 3 agents (1 host + 2 clients)...')
  log.info('SYSTEM', `Game URL: ${GAME_URL}`)
  log.info('SYSTEM', `Headless mode: ${HEADLESS}\n`)

  // Start host first
  const hostPromise = runHostAgent()

  // Wait for host to create room (so it appears in the browser)
  log.info('SYSTEM', 'Waiting for host to create room...')
  await setTimeout(5000) // Give host time to create the room

  // Start clients (they'll find the host's room in the browser)
  const client1Promise = runClientAgent(1)
  await setTimeout(2000)
  const client2Promise = runClientAgent(2)

  // Wait for all agents to complete
  log.info('SYSTEM', '\nWaiting for all agents to finish...')
  const [hostResult, client1Result, client2Result] = await Promise.all([
    hostPromise,
    client1Promise,
    client2Promise,
  ])

  // Generate report
  console.log('\n' + '='.repeat(70))
  console.log('📊 TEST REPORT')
  console.log('='.repeat(70))

  console.log(`\n✅ Host Result: ${hostResult.success ? 'SUCCESS' : 'FAILED'}`)
  if (!hostResult.success) console.log(`   Reason: ${hostResult.reason}`)

  console.log(`\n✅ Client 1 Result: ${client1Result.success ? 'SUCCESS' : 'FAILED'}`)
  if (!client1Result.success) console.log(`   Reason: ${client1Result.reason}`)

  console.log(`\n✅ Client 2 Result: ${client2Result.success ? 'SUCCESS' : 'FAILED'}`)
  if (!client2Result.success) console.log(`   Reason: ${client2Result.reason}`)

  if (issues.length > 0) {
    console.log(`\n\n🐛 ISSUES DETECTED: ${issues.length}`)
    console.log('='.repeat(70))
    issues.forEach((issue, i) => {
      console.log(`\n${i + 1}. [${issue.agent}] [${issue.type}]`)
      console.log(`   ${issue.message}`)
      console.log(`   Time: ${issue.timestamp.toLocaleTimeString()}`)
    })
  } else {
    console.log('\n\n✨ No issues detected!')
  }

  console.log('\n' + '='.repeat(70))
  console.log('ℹ️  Browsers left open for manual inspection.')
  console.log('   Press Ctrl+C to close all browsers and exit.')
  console.log('='.repeat(70) + '\n')
}

// Run the orchestrator
main().catch(error => {
  console.error('\n💥 Fatal error:', error)
  process.exit(1)
})
