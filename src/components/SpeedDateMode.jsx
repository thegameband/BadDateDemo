import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX
import {
  decideSpeedDatingPick,
  generateSpeedDatingOneLinerBatch,
  getLlmDebugSnapshot,
  getLlmErrorMessage,
} from '../services/llmService'
import {
  speakAndWait,
  setVoice,
  stopAllAudio,
} from '../services/ttsService'
import './SpeedDateMode.css'

const PLAYER_ID = 'player'
const PLAYER_NAME = 'You'
const PLAYER_INPUT_MAX = 90
const LINE_GAP_MS = 620
const TTS_MIN_TIMEOUT_MS = 4500
const TTS_MAX_TIMEOUT_MS = 15000
const PREFETCH_PLAYER_STYLE_SUMMARY = 'Player profile summary: confident, witty, playful flirt energy.'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function createDeferredValue() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return {
    promise,
    resolve,
    reject,
    settled: false,
  }
}

function getPrefetchKey(step, role = '') {
  if (!step) return ''
  if (step.type === 'ai_pair') return `${step.id}:${role || 'first'}`
  if (step.type === 'player_round') return `${step.id}:reply`
  return String(step.id || '')
}

function pickTwoDaters(daters = [], nonce = 0) {
  const pool = Array.isArray(daters) ? [...daters] : []
  if (!pool.length) return []

  const priorityNames = ['Kickflip', 'Adam']
  const byName = new Map(pool.map((dater) => [String(dater?.name || ''), dater]))
  const preferred = priorityNames
    .map((name) => byName.get(name))
    .filter(Boolean)

  if (preferred.length === 2) return preferred

  // Fallback (only if one of the preferred daters is missing): stable-ish random fill.
  const usedIds = new Set(preferred.map((dater) => String(dater.id)))
  const remaining = pool.filter((dater) => !usedIds.has(String(dater.id)))
  const offset = Math.abs(Number(nonce) || 0)
  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const j = (Math.floor(Math.random() * (i + 1)) + offset) % (i + 1)
    const temp = remaining[i]
    remaining[i] = remaining[j]
    remaining[j] = temp
  }
  return [...preferred, ...remaining].slice(0, 2)
}

function buildSpeedSequence(selectedDaters = []) {
  if (!Array.isArray(selectedDaters) || selectedDaters.length < 2) return []
  const [kickflip, adam] = selectedDaters
  return [
    { id: 'ai-kickflip-adam', type: 'ai_pair', first: kickflip, second: adam },
    { id: 'player-kickflip', type: 'player_round', target: kickflip },
    { id: 'player-adam', type: 'player_round', target: adam },
  ]
}

function buildBatchLinePlan(sequence = []) {
  if (!Array.isArray(sequence) || !sequence.length) return []
  const plan = []
  sequence.forEach((step) => {
    if (step?.type === 'ai_pair') {
      plan.push({
        key: getPrefetchKey(step, 'first'),
        speaker: step.first,
        target: step.second,
        targetType: 'dater',
      })
      plan.push({
        key: getPrefetchKey(step, 'second'),
        speaker: step.second,
        target: step.first,
        targetType: 'dater',
      })
      return
    }
    if (step?.type === 'player_round') {
      plan.push({
        key: getPrefetchKey(step),
        speaker: step.target,
        target: { id: PLAYER_ID, name: PLAYER_NAME },
        targetType: 'player',
      })
    }
  })
  return plan
}

function summarizePlayerPickupStyle(lines = []) {
  const latest = String(lines[lines.length - 1] || '').toLowerCase()
  const joined = String(lines.join(' ') || '').toLowerCase()
  const tags = []

  if (/\b(art|canvas|paint|poem|book|song|music|movie)\b/.test(joined)) {
    tags.push('creative and artsy')
  }
  if (/\b(chaos|reckless|wild|danger|crime|illegal|trouble)\b/.test(joined)) {
    tags.push('chaotic and risk-friendly')
  }
  if (/\b(cute|sweet|soft|cozy|romantic|gentle)\b/.test(joined)) {
    tags.push('soft-romantic')
  }
  if (/\b(kiss|drink|number|date|tonight|come with me)\b/.test(joined)) {
    tags.push('direct about flirty intent')
  }
  if (/\b(please|maybe|kinda|sorta)\b/.test(joined)) {
    tags.push('lightly cautious')
  } else {
    tags.push('confident')
  }
  if (/\?$/.test(latest)) {
    tags.push('teasing question style')
  }

  const deduped = [...new Set(tags)].slice(0, 3)
  return `Player profile summary: ${deduped.join(', ')}.`
}

function summarizeFirstSentence(text = '', maxLength = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const first = clean.match(/[^.!?]+[.!?]/)?.[0]?.trim() || clean
  if (first.length <= maxLength) return first
  return `${first.slice(0, maxLength).trimEnd()}...`
}

function getDaterMajorFeature(dater) {
  const raw = String(dater?.archetype || '').trim()
  if (!raw) return 'The Mysterious Wildcard'
  return /^the\s/i.test(raw) ? raw : `The ${raw}`
}

function toSenderLookup(selectedDaters = []) {
  const map = new Map([[PLAYER_ID, PLAYER_NAME]])
  selectedDaters.forEach((dater) => {
    map.set(String(dater.id), dater.name)
  })
  return map
}

export default function SpeedDateMode({ daters = [], onBack }) {
  const [runNonce, setRunNonce] = useState(0)
  const selectedDaters = useMemo(() => pickTwoDaters(daters, runNonce), [daters, runNonce])
  const sequence = useMemo(() => buildSpeedSequence(selectedDaters), [selectedDaters])

  const [stage, setStage] = useState('intro') // intro | run | pick | results
  const [stepIndex, setStepIndex] = useState(0)
  const [exchangeLog, setExchangeLog] = useState([])
  const [playerLines, setPlayerLines] = useState([])
  const [playerProfileSummary, setPlayerProfileSummary] = useState('No player line yet; first impression pending.')
  const [playerInput, setPlayerInput] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [playerChoiceId, setPlayerChoiceId] = useState('')
  const [pickDecisions, setPickDecisions] = useState([])
  const [finalScore, setFinalScore] = useState(null)
  const [errorText, setErrorText] = useState('')
  const [debugText, setDebugText] = useState('')
  const [debugDump, setDebugDump] = useState('')
  const [openTargetCardId, setOpenTargetCardId] = useState('')
  const [targetCardPlacement, setTargetCardPlacement] = useState({
    vertical: 'down',
    top: 12,
    left: 12,
    width: 320,
  })

  const exchangeLogRef = useRef(exchangeLog)
  const playerLinesRef = useRef(playerLines)
  const feedRef = useRef(null)
  const aiPairBusyRef = useRef(false)
  const playerInputRef = useRef(null)
  const targetWrapRef = useRef(null)
  const targetCardRef = useRef(null)
  const prefetchSeedRef = useRef('')
  const prefetchStateRef = useRef({
    runId: 0,
    deferredByKey: new Map(),
  })

  useEffect(() => {
    exchangeLogRef.current = exchangeLog
  }, [exchangeLog])

  useEffect(() => {
    playerLinesRef.current = playerLines
  }, [playerLines])

  useEffect(() => {
    if (!feedRef.current) return
    feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [exchangeLog.length, stage])

  const senderLookup = useMemo(() => toSenderLookup(selectedDaters), [selectedDaters])
  const currentStep = stage === 'run' ? sequence[stepIndex] : null
  const currentTarget = currentStep?.type === 'player_round' ? currentStep.target : null
  const currentTargetFeature = getDaterMajorFeature(currentTarget)
  const isTargetCardOpen = currentTarget && String(openTargetCardId) === String(currentTarget.id)

  const exchangeGroups = useMemo(() => {
    const groups = []
    const byId = new Map()

    exchangeLog.forEach((entry, idx) => {
      const groupId = String(entry?.exchangeId || entry?.id || `exchange-${idx + 1}`)
      if (!byId.has(groupId)) {
        const group = {
          id: groupId,
          label: entry?.exchangeLabel || `Exchange ${groups.length + 1}`,
          lines: [],
        }
        byId.set(groupId, group)
        groups.push(group)
      }
      byId.get(groupId).lines.push(entry)
    })

    return groups
  }, [exchangeLog])

  const batchLinePlan = useMemo(() => buildBatchLinePlan(sequence), [sequence])

  const prefetchFingerprint = useMemo(() => (
    batchLinePlan
      .map((entry) => `${entry.key}:${entry.speaker?.id || 'x'}:${entry.target?.id || 'x'}`)
      .join('|')
  ), [batchLinePlan])

  const appendExchange = useCallback((entry) => {
    setExchangeLog((prev) => {
      const next = [
        ...prev,
        {
          id: `${Date.now()}-${prev.length + 1}`,
          ...entry,
        },
      ]
      exchangeLogRef.current = next
      return next
    })
  }, [])

  const resetRunState = useCallback(() => {
    setStage('intro')
    setStepIndex(0)
    setExchangeLog([])
    setPlayerLines([])
    setPlayerProfileSummary('No player line yet; first impression pending.')
    setPlayerInput('')
    setIsWorking(false)
    setStatusText('')
    setPlayerChoiceId('')
    setPickDecisions([])
    setFinalScore(null)
    setErrorText('')
    setDebugText('')
    setDebugDump('')
  }, [])

  const withTimeout = useCallback((promise, ms) => (
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`TTS timeout (${ms}ms)`)), ms)),
    ])
  ), [])

  const invalidatePrefetch = useCallback(() => {
    prefetchStateRef.current = {
      runId: prefetchStateRef.current.runId + 1,
      deferredByKey: new Map(),
    }
  }, [])

  const estimateTtsTimeout = useCallback((text = '') => {
    const words = String(text || '').split(/\s+/).filter(Boolean).length
    const estimated = 2200 + (words * 380)
    return Math.max(TTS_MIN_TIMEOUT_MS, Math.min(TTS_MAX_TIMEOUT_MS, estimated))
  }, [])

  const speakLineBlocking = useCallback(async ({ text, speaker = 'avatar', dater = null }) => {
    const line = String(text || '').trim()
    if (!line) return

    try {
      if (speaker === 'dater' && dater?.voiceId) {
        const isMale = String(dater?.pronouns || '').toLowerCase().includes('he')
        setVoice('dater', dater.voiceId, isMale)
      }
      const timeoutMs = estimateTtsTimeout(line)
      await withTimeout(speakAndWait(line, speaker), timeoutMs)
    } catch (error) {
      console.warn('SpeedDate TTS skipped due to timeout/failure:', error)
      stopAllAudio()
    }
  }, [estimateTtsTimeout, withTimeout])

  const startSpeedRoundPrefetch = useCallback((linePlan = batchLinePlan) => {
    if (!Array.isArray(linePlan) || !linePlan.length) return

    const runId = prefetchStateRef.current.runId + 1
    const deferredByKey = new Map()
    linePlan.forEach((entry) => {
      if (!entry?.key) return
      deferredByKey.set(String(entry.key), createDeferredValue())
    })
    prefetchStateRef.current = { runId, deferredByKey }

    const settleDeferred = (key, value = null) => {
      const deferred = deferredByKey.get(key)
      if (!deferred || deferred.settled) return
      deferred.settled = true
      deferred.resolve(value || null)
    }

    const settleAllPendingAsNull = () => {
      deferredByKey.forEach((deferred) => {
        if (deferred?.settled) return
        deferred.settled = true
        deferred.resolve(null)
      })
    }

    ;(async () => {
      try {
        const batchMap = await generateSpeedDatingOneLinerBatch({
          linePlan,
          playerProfileSummary: PREFETCH_PLAYER_STYLE_SUMMARY,
        })
        if (prefetchStateRef.current.runId !== runId) return
        linePlan.forEach((entry) => {
          if (!entry?.key) return
          const line = batchMap?.[entry.key] || null
          settleDeferred(entry.key, line)
        })
      } catch (error) {
        if (prefetchStateRef.current.runId === runId) {
          console.error('SpeedDate prefetch error:', error)
          settleAllPendingAsNull()
        }
      }
    })()
  }, [batchLinePlan])

  const ensurePrefetchReady = useCallback((linePlan = batchLinePlan) => {
    if (!Array.isArray(linePlan) || !linePlan.length) return
    if (prefetchStateRef.current.deferredByKey.size > 0) return
    startSpeedRoundPrefetch(linePlan)
  }, [batchLinePlan, startSpeedRoundPrefetch])

  const waitForBatchPrefetch = useCallback(async (linePlan = batchLinePlan, timeoutMs = 22000) => {
    if (!Array.isArray(linePlan) || !linePlan.length) {
      return { ok: false, reason: 'no_plan', missingKeys: [] }
    }

    ensurePrefetchReady(linePlan)

    const snapshots = linePlan.map((entry) => {
      const key = String(entry?.key || '')
      return {
        key,
        deferred: key ? prefetchStateRef.current.deferredByKey.get(key) : null,
      }
    })

    const missingDeferred = snapshots
      .filter((item) => !item.deferred)
      .map((item) => item.key)
      .filter(Boolean)
    if (missingDeferred.length) {
      return { ok: false, reason: 'missing_deferred', missingKeys: missingDeferred }
    }

    const batchResult = await Promise.race([
      Promise.all(snapshots.map((item) => item.deferred.promise)),
      wait(timeoutMs).then(() => null),
    ])

    if (!Array.isArray(batchResult)) {
      return {
        ok: false,
        reason: 'timeout',
        missingKeys: snapshots.map((item) => item.key),
      }
    }

    const missingLines = snapshots
      .filter((item, index) => !String(batchResult[index] || '').trim())
      .map((item) => item.key)

    if (missingLines.length) {
      return { ok: false, reason: 'missing_lines', missingKeys: missingLines }
    }

    return { ok: true, reason: '', missingKeys: [] }
  }, [batchLinePlan, ensurePrefetchReady])

  const getPrefetchedLine = useCallback(async ({
    step,
    role = '',
  }) => {
    ensurePrefetchReady(batchLinePlan)
    const key = getPrefetchKey(step, role)
    const deferred = prefetchStateRef.current.deferredByKey.get(key)
    if (!deferred) return null
    try {
      return await deferred.promise
    } catch (error) {
      console.warn('SpeedDate prefetched line unavailable:', error)
      return null
    }
  }, [batchLinePlan, ensurePrefetchReady])

  const recomputeTargetCardPlacement = useCallback(() => {
    const wrapEl = targetWrapRef.current
    if (!wrapEl || typeof window === 'undefined') return

    const rect = wrapEl.getBoundingClientRect()
    const viewportPadding = 12
    const anchorGap = 4
    const cardWidth = Math.min(320, Math.max(220, window.innerWidth - (viewportPadding * 2)))
    const measuredCardHeight = Number(targetCardRef.current?.offsetHeight || 0)
    const estimatedCardHeight = Math.max(120, Math.min(260, measuredCardHeight || 160))

    const downTop = rect.bottom + anchorGap
    const upTop = rect.top - estimatedCardHeight - anchorGap
    const wouldOverflowBottom = downTop + estimatedCardHeight > window.innerHeight - viewportPadding

    setTargetCardPlacement({
      vertical: wouldOverflowBottom && upTop >= viewportPadding ? 'up' : 'down',
      top: Math.max(viewportPadding, wouldOverflowBottom && upTop >= viewportPadding ? upTop : downTop),
      left: Math.max(viewportPadding, Math.round((window.innerWidth - cardWidth) / 2)),
      width: cardWidth,
    })
  }, [])

  useEffect(() => {
    if (stage !== 'run') return
    if (stepIndex < sequence.length) return
    setStage('pick')
    setStatusText('All lines are in. Pick your favorite dater.')
  }, [stage, stepIndex, sequence.length])

  useEffect(() => () => {
    stopAllAudio()
    invalidatePrefetch()
  }, [invalidatePrefetch])

  useEffect(() => {
    if (stage !== 'intro' || !batchLinePlan.length) return
    const prefetchKey = `${runNonce}:${prefetchFingerprint}`
    if (prefetchSeedRef.current === prefetchKey) return
    prefetchSeedRef.current = prefetchKey
    startSpeedRoundPrefetch(batchLinePlan)
  }, [batchLinePlan, prefetchFingerprint, runNonce, stage, startSpeedRoundPrefetch])

  useEffect(() => {
    if (stage !== 'run' || currentStep?.type !== 'player_round') return undefined
    recomputeTargetCardPlacement()
    const handleResize = () => recomputeTargetCardPlacement()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [currentStep?.id, currentStep?.type, recomputeTargetCardPlacement, stage])

  useEffect(() => {
    if (!isTargetCardOpen) return
    const frameId = window.requestAnimationFrame(() => {
      recomputeTargetCardPlacement()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [isTargetCardOpen, recomputeTargetCardPlacement])

  useEffect(() => {
    if (stage === 'run' && currentStep?.type === 'player_round' && !isWorking) {
      playerInputRef.current?.focus()
      return
    }
    setOpenTargetCardId('')
  }, [currentStep?.id, currentStep?.type, isWorking, stage])

  useEffect(() => {
    let cancelled = false
    if (stage !== 'run') return undefined
    const step = sequence[stepIndex]
    if (!step || step.type !== 'ai_pair') return undefined
    if (aiPairBusyRef.current) return undefined

    const runAiPair = async () => {
      aiPairBusyRef.current = true
      setErrorText('')
      setIsWorking(true)
      try {
        setStatusText(`${step.first.name} takes the first shot at ${step.second.name}.`)
        const lineOne = await getPrefetchedLine({
          step,
          role: 'first',
        })
        if (cancelled) return
        if (lineOne) {
          appendExchange({
            exchangeId: step.id,
            exchangeLabel: `${step.first.name} ↔ ${step.second.name}`,
            fromId: String(step.first.id),
            fromName: step.first.name,
            toId: String(step.second.id),
            toName: step.second.name,
            text: lineOne,
            kind: 'dater',
          })
          await speakLineBlocking({ text: lineOne, speaker: 'dater', dater: step.first })
        }

        await wait(LINE_GAP_MS)
        if (cancelled) return

        setStatusText(`${step.second.name} takes a shot at ${step.first.name}.`)
        const lineTwo = await getPrefetchedLine({
          step,
          role: 'second',
        })
        if (cancelled) return
        if (lineTwo) {
          appendExchange({
            exchangeId: step.id,
            exchangeLabel: `${step.first.name} ↔ ${step.second.name}`,
            fromId: String(step.second.id),
            fromName: step.second.name,
            toId: String(step.first.id),
            toName: step.first.name,
            text: lineTwo,
            kind: 'dater',
          })
          await speakLineBlocking({ text: lineTwo, speaker: 'dater', dater: step.second })
        } else if (!cancelled) {
          setErrorText(`${step.second.name} had a line glitch this round. Continuing.`)
        }

        setStepIndex((prev) => prev + 1)
      } catch (error) {
        if (!cancelled) {
          console.error('SpeedDate ai_pair error:', error)
          setErrorText('Could not generate an exchange line. Try replaying this run.')
        }
      } finally {
        aiPairBusyRef.current = false
        if (!cancelled) setIsWorking(false)
      }
    }

    runAiPair()
    return () => {
      cancelled = true
    }
  }, [appendExchange, getPrefetchedLine, sequence, speakLineBlocking, stage, stepIndex])

  const handleStart = useCallback(async () => {
    if (isWorking) return
    stopAllAudio()
    setIsWorking(true)
    setErrorText('')
    setDebugText('')
    setDebugDump('')
    setStatusText('Warming up dater one-liners...')

    try {
      let prefetch = await waitForBatchPrefetch(batchLinePlan)
      if (!prefetch.ok) {
        invalidatePrefetch()
        prefetchSeedRef.current = ''
        startSpeedRoundPrefetch(batchLinePlan)
        prefetch = await waitForBatchPrefetch(batchLinePlan)
      }
      if (!prefetch.ok) {
        const missingCount = prefetch.missingKeys.length
        throw new Error(`prefetch_${prefetch.reason}:${missingCount}`)
      }

      setStage('run')
      setStepIndex(0)
      setExchangeLog([])
      setPlayerLines([])
      setPlayerProfileSummary('No player line yet; first impression pending.')
      setPlayerInput('')
      setStatusText('Watch the first exchange, then you jump in.')
      setPlayerChoiceId('')
      setPickDecisions([])
      setFinalScore(null)
    } catch (error) {
      const llmError = getLlmErrorMessage()
      const llmDebug = getLlmDebugSnapshot()
      const prefetchReason = String(error?.message || 'unknown')
      const debugParts = [
        `prefetch=${prefetchReason}`,
        llmError ? `llm=${llmError}` : '',
        llmDebug?.stage ? `stage=${llmDebug.stage}` : '',
        Number.isFinite(Number(llmDebug?.status)) ? `status=${llmDebug.status}` : '',
      ].filter(Boolean)
      const summary = debugParts.join(' | ')
      console.error('SpeedDate start prefetch error:', error)
      console.error('SpeedDate start prefetch debug:', {
        llmError,
        llmDebug,
        linePlanKeys: batchLinePlan.map((entry) => entry?.key),
      })
      setStage('intro')
      setStatusText('')
      setErrorText('Could not pre-generate all one-liners. Tap Start to retry.')
      setDebugText(summary || 'No debug details available.')
      setDebugDump(JSON.stringify({
        prefetchError: {
          message: prefetchReason,
        },
        llmError,
        llmDebug,
      }, null, 2))
    } finally {
      setIsWorking(false)
    }
  }, [batchLinePlan, invalidatePrefetch, isWorking, startSpeedRoundPrefetch, waitForBatchPrefetch])

  const handleReplay = useCallback(() => {
    stopAllAudio()
    invalidatePrefetch()
    prefetchSeedRef.current = ''
    setRunNonce((prev) => prev + 1)
    resetRunState()
  }, [invalidatePrefetch, resetRunState])

  const handleBackClick = useCallback(() => {
    stopAllAudio()
    invalidatePrefetch()
    prefetchSeedRef.current = ''
    onBack?.()
  }, [invalidatePrefetch, onBack])

  const handlePlayerSubmit = useCallback(async (event) => {
    event.preventDefault()
    if (stage !== 'run' || isWorking) return
    const step = sequence[stepIndex]
    if (!step || step.type !== 'player_round') return
    const trimmed = playerInput.trim()
    if (!trimmed) return

    setIsWorking(true)
    setErrorText('')
    appendExchange({
      exchangeId: step.id,
      exchangeLabel: `${PLAYER_NAME} ↔ ${step.target.name}`,
      fromId: PLAYER_ID,
      fromName: PLAYER_NAME,
      toId: String(step.target.id),
      toName: step.target.name,
      text: trimmed,
      kind: 'player',
    })
    setPlayerInput('')

    const nextPlayerLines = [...playerLinesRef.current, trimmed]
    playerLinesRef.current = nextPlayerLines
    setPlayerLines(nextPlayerLines)
    const profileSummary = summarizePlayerPickupStyle(nextPlayerLines)
    setPlayerProfileSummary(profileSummary)

    try {
      // Resolve prefetched reply while player VO runs.
      const replyPromise = getPrefetchedLine({
        step,
      })
      await speakLineBlocking({ text: trimmed, speaker: 'avatar' })
      setStatusText(`${step.target.name} has a line for you...`)
      const reply = await replyPromise
      if (reply) {
        appendExchange({
          exchangeId: step.id,
          exchangeLabel: `${PLAYER_NAME} ↔ ${step.target.name}`,
          fromId: String(step.target.id),
          fromName: step.target.name,
          toId: PLAYER_ID,
          toName: PLAYER_NAME,
          text: reply,
          kind: 'dater',
        })
        await speakLineBlocking({ text: reply, speaker: 'dater', dater: step.target })
      }

      setStepIndex((prev) => prev + 1)
    } catch (error) {
      console.error('SpeedDate player round error:', error)
      setErrorText('Could not complete this round. You can try replaying.')
    } finally {
      setIsWorking(false)
    }
  }, [appendExchange, getPrefetchedLine, isWorking, playerInput, sequence, speakLineBlocking, stage, stepIndex])

  const incomingByDater = useMemo(() => {
    const map = new Map(selectedDaters.map((dater) => [String(dater.id), new Map()]))
    exchangeLog.forEach((entry) => {
      const toId = String(entry.toId)
      if (!map.has(toId)) return
      const senderId = String(entry.fromId)
      map.get(toId).set(senderId, {
        senderId,
        senderName: entry.fromName,
        line: entry.text,
      })
    })
    return map
  }, [exchangeLog, selectedDaters])

  const handleLockInPicks = useCallback(async () => {
    if (!playerChoiceId || isWorking) return
    setIsWorking(true)
    setErrorText('')
    setStatusText('Everyone is choosing...')

    try {
      const decisions = []
      for (const dater of selectedDaters) {
        const incoming = [...(incomingByDater.get(String(dater.id))?.values() || [])]
        if (!incoming.length) continue
        const decision = await decideSpeedDatingPick({
          chooser: dater,
          incomingLines: incoming,
          playerProfileSummary,
        })
        if (!decision) {
          throw new Error(`No valid pick output for ${dater.name}`)
        }
        decisions.push(decision)
      }

      const picksYou = decisions.filter((decision) => String(decision.pickedId) === PLAYER_ID).length
      const mutualMatch = decisions.some(
        (decision) =>
          String(decision.chooserId) === String(playerChoiceId) &&
          String(decision.pickedId) === PLAYER_ID
      )
      const total = (picksYou * 500) + (mutualMatch ? 1000 : 0)

      setPickDecisions(decisions)
      setFinalScore({
        picksYou,
        mutualMatch,
        total,
      })
      setStage('results')
      setStatusText('Picks locked.')
    } catch (error) {
      console.error('SpeedDate lock-in error:', error)
      setErrorText('Could not resolve picks. Please replay this run.')
    } finally {
      setIsWorking(false)
    }
  }, [incomingByDater, isWorking, playerChoiceId, playerProfileSummary, selectedDaters])

  const playerChosenName = senderLookup.get(String(playerChoiceId)) || 'No one selected'

  if (selectedDaters.length < 2) {
    return (
      <div className="speed-date">
        <div className="speed-date-header">
          <button type="button" className="speed-date-back" onClick={handleBackClick}>← Back</button>
          <h2 className="speed-date-title">Speed Date</h2>
        </div>
        <div className="speed-date-fallback">Need at least two daters to run this mode.</div>
      </div>
    )
  }

  return (
    <div className="speed-date">
      <div className="speed-date-header">
        <button type="button" className="speed-date-back" onClick={handleBackClick}>← Back</button>
        <h2 className="speed-date-title">Speed Date</h2>
        <p className="speed-date-subtitle">Kickflip and Adam. Fast one-liners. You make the final call.</p>
      </div>

      {stage === 'intro' && (
        <div className="speed-date-intro">
          <div className="speed-date-dater-grid">
            {selectedDaters.map((dater) => (
              <div key={dater.id} className="speed-date-dater-card">
                <div className="speed-date-dater-name">{dater.name}</div>
                <div className="speed-date-dater-archetype">{dater.archetype}</div>
                <div className="speed-date-dater-tagline">{dater.tagline}</div>
              </div>
            ))}
          </div>
          <p className="speed-date-rule">
            You’ll see dater-to-dater exchanges first, then trade lines yourself.
          </p>
          <button type="button" className="speed-date-primary-btn" onClick={handleStart} disabled={isWorking}>
            {isWorking ? 'Generating One-Liners...' : 'Start Speed Round'}
          </button>
          {errorText && <p className="speed-date-error">{errorText}</p>}
          {debugText && <p className="speed-date-error">{debugText}</p>}
          {debugDump && (
            <pre className="speed-date-debug-dump">{debugDump}</pre>
          )}
        </div>
      )}

      {(stage === 'run' || stage === 'pick' || stage === 'results') && (
        <div className="speed-date-main">
          <div className="speed-date-run-meta">
            <span className="speed-date-step">Step {Math.min(stepIndex + 1, sequence.length)} / {sequence.length}</span>
            <span className="speed-date-status">{statusText || ' '}</span>
          </div>

          <div className="speed-date-feed" ref={feedRef}>
            <AnimatePresence initial={false}>
              {exchangeGroups.map((group, groupIndex) => (
                <motion.div
                  key={group.id}
                  className="speed-date-exchange-group"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="speed-date-exchange-meta">
                    <span className="speed-date-exchange-count">Exchange {groupIndex + 1}</span>
                    <span className="speed-date-exchange-label">{group.label}</span>
                  </div>
                  <div className="speed-date-exchange-lines">
                    {group.lines.map((entry) => (
                      <div
                        key={entry.id}
                        className={`speed-date-line ${entry.fromId === PLAYER_ID ? 'from-player' : 'from-dater'}`}
                      >
                        <div className="speed-date-line-meta">
                          <span>{entry.fromName}</span>
                          <span>→</span>
                          <span>{entry.toName}</span>
                        </div>
                        <p className="speed-date-line-text">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {stage === 'run' && currentStep?.type === 'player_round' && (
            <form className="speed-date-input-wrap is-active" onSubmit={handlePlayerSubmit}>
              <label className="speed-date-input-label">
                <span>Your line to </span>
                <span
                  ref={targetWrapRef}
                  className={`speed-date-target-wrap ${isTargetCardOpen ? 'open' : ''} ${targetCardPlacement.vertical === 'up' ? 'open-up' : 'open-down'}`}
                >
                  <button
                    type="button"
                    className="speed-date-target-trigger"
                    aria-expanded={Boolean(isTargetCardOpen)}
                    onMouseEnter={recomputeTargetCardPlacement}
                    onFocus={recomputeTargetCardPlacement}
                    onClick={() =>
                      {
                        recomputeTargetCardPlacement()
                        setOpenTargetCardId((prev) => (
                          String(prev) === String(currentStep.target.id)
                            ? ''
                            : String(currentStep.target.id)
                        ))
                      }
                    }
                  >
                    <strong>{currentStep.target.name}</strong>
                    <span className="speed-date-target-major">({currentTargetFeature})</span>
                  </button>
                  <div
                    ref={targetCardRef}
                    className="speed-date-target-card"
                    style={{
                      left: `${targetCardPlacement.left}px`,
                      top: `${targetCardPlacement.top}px`,
                      width: `${targetCardPlacement.width}px`,
                    }}
                  >
                    <div className="speed-date-target-card-head">
                      <strong>{currentStep.target.name}</strong>
                      <span>{currentTargetFeature}</span>
                    </div>
                    <p className="speed-date-target-card-description">
                      {summarizeFirstSentence(currentStep.target.description, 200)}
                    </p>
                  </div>
                </span>
              </label>
              <input
                ref={playerInputRef}
                type="text"
                className="speed-date-input"
                value={playerInput}
                onChange={(event) => setPlayerInput(event.target.value)}
                maxLength={PLAYER_INPUT_MAX}
                placeholder="Type one funny line..."
                disabled={isWorking}
                autoComplete="off"
              />
              <div className="speed-date-input-footer">
                <span className="speed-date-count">{playerInput.length}/{PLAYER_INPUT_MAX}</span>
                <button
                  type="submit"
                  className="speed-date-send-btn"
                  disabled={isWorking || !playerInput.trim()}
                >
                  Send
                </button>
              </div>
            </form>
          )}

          {stage === 'run' && currentStep?.type === 'ai_pair' && (
            <div className="speed-date-waiting">Daters are exchanging lines…</div>
          )}

          {stage === 'pick' && (
            <div className="speed-date-pick-wrap">
              <p className="speed-date-pick-title">Who do you pick?</p>
              <div className="speed-date-pick-grid">
                {selectedDaters.map((dater) => (
                  <button
                    type="button"
                    key={dater.id}
                    className={`speed-date-pick-btn ${String(playerChoiceId) === String(dater.id) ? 'selected' : ''}`}
                    onClick={() => setPlayerChoiceId(String(dater.id))}
                    disabled={isWorking}
                  >
                    <span>{dater.name}</span>
                    <small>{dater.archetype}</small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="speed-date-primary-btn"
                onClick={handleLockInPicks}
                disabled={isWorking || !playerChoiceId}
              >
                Lock My Pick
              </button>
            </div>
          )}

          {stage === 'results' && finalScore && (
            <div className="speed-date-results">
              <div className="speed-date-score-total">{finalScore.total}</div>
              <p className="speed-date-score-breakdown">
                Picked you: {finalScore.picksYou} × 500
                {finalScore.mutualMatch ? ' + 1000 mutual bonus' : ' + 0 mutual bonus'}
              </p>
              <p className="speed-date-player-pick">You picked: <strong>{playerChosenName}</strong></p>
              <div className="speed-date-results-list">
                {pickDecisions.map((decision) => {
                  const pickedYou = String(decision.pickedId) === PLAYER_ID
                  return (
                    <div key={decision.chooserId} className="speed-date-result-row">
                      <span>{decision.chooserName} picked</span>
                      <strong>{decision.pickedName}</strong>
                      {pickedYou && <em>picked you</em>}
                    </div>
                  )
                })}
              </div>
              <button type="button" className="speed-date-primary-btn" onClick={handleReplay}>
                Replay
              </button>
            </div>
          )}

          {errorText && <p className="speed-date-error">{errorText}</p>}
        </div>
      )}
    </div>
  )
}
