/**
 * Two-round debate orchestration.
 *
 * Round one runs every debater in parallel and independently. Round two shows
 * each debater the full first round and demands a named rebuttal. The judge
 * then reads the whole record and must return a verdict that passes
 * `validateVerdict`; one failed attempt is retried with the validation errors
 * fed back. A timeout never becomes a fake success: unfinished voices, a
 * missing verdict, and contract failures are recorded as `incomplete`.
 *
 * Children are spawned through `ctx.subagents` with `delivery: 'caller'`, so
 * their results reach this engine without being injected into the parent
 * session. Every child id is tracked so a timeout can interrupt it.
 */

import { randomUUID } from 'node:crypto'
import { ROUND1_SCHEMA, ROUND2_SCHEMA, VERDICT_SCHEMA } from './schemas.js'
import { claimMap, validateRound1, validateRound2, validateVerdict } from './verdict.js'
import { buildJudgePrompt, buildRound1Prompt, buildRound2Prompt } from './prompts.js'
import { DEFAULT_DEBATERS, DEFAULT_JUDGE, roleLabel } from './roles.js'

/** Choose the first registered provider that can enforce an output schema. */
export function selectProvider(subagents) {
  if (!subagents || typeof subagents.list !== 'function') return undefined
  for (const name of subagents.list()) {
    const provider = subagents.getProvider?.(name)
    if (provider?.capabilities?.outputSchema) return name
  }
  return undefined
}

function titleOf(idea) {
  const line = String(idea ?? '').replace(/\s+/g, ' ').trim()
  return line.slice(0, 60) || '未命名辩题'
}

/**
 * Run one debate.
 * @param {object} options
 * @param {object} options.subagents `ctx.subagents`
 * @param {object} options.parent calling Agent
 * @param {string} options.idea
 * @param {string[]} [options.contextPaths]
 * @param {string} [options.cwd]
 * @param {'zh'|'en'} [options.language]
 * @param {number} [options.rounds]
 * @param {number} [options.timeLimitMs]
 * @param {number} [options.softStopMs]
 * @param {object[]} [options.debaters]
 * @param {object} [options.judge]
 * @param {string} [options.sessionId]
 * @param {AbortSignal} [options.signal]
 * @param {(id: string) => void} [options.trackChild]
 * @param {(id: string) => void} [options.untrackChild]
 * @param {(snapshot: object) => void} [options.onUpdate]
 * @param {() => number} [options.now]
 * @returns {Promise<object>} debate record
 */
export async function runDebate(options) {
  const {
    subagents,
    parent,
    idea,
    contextPaths = [],
    cwd,
    language = 'zh',
    rounds: configuredRounds = 2,
    timeLimitMs = 120_000,
    softStopMs = 100_000,
    debaters = DEFAULT_DEBATERS,
    judge = DEFAULT_JUDGE,
    sessionId,
    signal,
    trackChild = () => {},
    untrackChild = () => {},
    onUpdate = () => {},
    now = Date.now,
  } = options

  if (!subagents || typeof subagents.startActivation !== 'function') {
    throw new Error('debate requires ctx.subagents (subagent service unavailable)')
  }
  if (!parent || typeof parent.id !== 'string') {
    throw new Error('debate requires the calling agent (exec.agent was undefined)')
  }
  const providerName = selectProvider(subagents)
  if (providerName === undefined) {
    throw new Error('no subagent provider supports structured output')
  }

  const startedAt = now()
  const rounds = Math.max(1, Math.min(3, configuredRounds))
  const hardStop = Math.max(1_000, timeLimitMs)
  const softStop = Math.max(1_000, Math.min(softStopMs, hardStop))
  const id = `d-${startedAt.toString(36)}-${randomUUID().slice(0, 8)}`

  const overall = new AbortController()
  const roundScope = new AbortController()
  const active = new Set()
  let timedOut = false
  let userAborted = false

  const interruptAll = () => {
    for (const childId of active) {
      try {
        subagents.interrupt(childId, { kind: 'ancestor', agent: parent })
      } catch {
        // An already-settled child is an accepted no-op; a race here is harmless.
      }
    }
  }

  const softTimer = setTimeout(() => {
    if (!roundScope.signal.aborted) roundScope.abort(new Error('soft stop'))
  }, softStop)
  const hardTimer = setTimeout(() => {
    timedOut = true
    if (!roundScope.signal.aborted) roundScope.abort(new Error('time limit'))
    if (!overall.signal.aborted) overall.abort(new Error('time limit'))
    interruptAll()
  }, hardStop)
  const onAbort = () => {
    userAborted = true
    if (!roundScope.signal.aborted) roundScope.abort(new Error('cancelled'))
    if (!overall.signal.aborted) overall.abort(new Error('cancelled'))
    interruptAll()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  const speak = async (role, prompt, schema, callSignal, allowTools = false) => {
    const childId = randomUUID()
    let activation
    active.add(childId)
    trackChild(childId, { tools: allowTools })
    try {
      callSignal.throwIfAborted()
      activation = await subagents.startActivation({
        provider: providerName,
        label: `debate:${role.id}`,
        childId,
        request: {
          prompt: [{ type: 'text', text: prompt }],
          parent,
          ...(cwd === undefined ? {} : { cwd }),
          maxDepth: 1,
          outputSchema: schema,
          ...(role.provider && role.model
            ? { agentOptions: { provider: role.provider, model: role.model } }
            : {}),
        },
        signal: callSignal,
        delivery: 'caller',
      })
      return await activation.result
    } finally {
      active.delete(childId)
      untrackChild(childId)
      if (activation && typeof activation.dispose === 'function') {
        try {
          await activation.dispose()
        } catch {
          // Releasing a finished activation must not fail the debate.
        }
      }
    }
  }

  const round1 = {}
  const round2 = {}
  const missingVoices = []
  const warnings = []
  const incompleteReasons = []
  const timings = { round1Ms: 0, round2Ms: 0, judgeMs: 0 }

  try {
    const r1Start = now()
    const debaterRoles = debaters.filter((role) => role && role.id)
    const first = await Promise.all(debaterRoles.map(async (role) => {
      try {
        const result = await speak(
          role,
          buildRound1Prompt({ idea, role, language, contextPaths, cwd, hasTools: contextPaths.length > 0 }),
          ROUND1_SCHEMA,
          roundScope.signal,
          contextPaths.length > 0,
        )
        return { role, result }
      } catch (error) {
        return { role, error }
      }
    }))
    if (userAborted) throw abortError()
    timings.round1Ms = now() - r1Start

    for (const { role, result, error } of first) {
      if (error) {
        missingVoices.push(`${role.id}（${error?.message ?? '调用失败'}）`)
        continue
      }
      const structured = asStructured(result)
      if (!structured) {
        missingVoices.push(`${role.id}（${describeMissing(result)}）`)
        continue
      }
      const speech = withPrefixedClaims(role.id, structured)
      round1[role.id] = speech
      const errors = validateRound1(speech)
      if (errors.length > 0) warnings.push(`第 1 轮 ${role.id}：${errors.join('；')}`)
    }
    onUpdate({ id, phase: 'round1', round1 })

    const canRunSecond = rounds >= 2 && Object.keys(round1).length > 0 && !roundScope.signal.aborted
    if (canRunSecond) {
      const r2Start = now()
      const second = await Promise.all(Object.keys(round1).map(async (speakerId) => {
        const role = debaterRoles.find((candidate) => candidate.id === speakerId)
        try {
          const result = await speak(
            role,
            buildRound2Prompt({ idea, role, language, round1 }),
            ROUND2_SCHEMA,
            roundScope.signal,
            contextPaths.length > 0,
          )
          return { role, result }
        } catch (error) {
          return { role, error }
        }
      }))
      if (userAborted) throw abortError()
      timings.round2Ms = now() - r2Start

      const claims = claimMap(round1)
      for (const { role, result, error } of second) {
        const structured = error ? undefined : asStructured(result)
        if (error || !structured) {
          warnings.push(`第 2 轮 ${role.id} 未产出结构化反驳（${error ? (error?.message ?? '调用失败') : describeMissing(result)}）`)
          continue
        }
        round2[role.id] = structured
        const errors = validateRound2(structured, claims)
        if (errors.length > 0) {
          warnings.push(`第 2 轮 ${role.id}：${errors.join('；')}`)
          incompleteReasons.push(`第 2 轮 ${role.id} 的反驳不满足契约：${errors[0]}`)
        }
      }
    } else if (rounds >= 2) {
      warnings.push('第 2 轮未运行：没有可用的第 1 轮陈词')
    }
    onUpdate({ id, phase: 'round2', round1, round2 })

    let verdict = null
    let verdictRaw = null
    let verdictErrors = []
    const stances = Object.values(round1).map((speech) => speech?.stance).filter(Boolean)

    const judgeStart = now()
    if (Object.keys(round1).length > 0) {
      const basePrompt = buildJudgePrompt({
        idea,
        round1,
        round2,
        language,
        hasSecondRound: Object.keys(round2).length > 0,
      })
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let result
        try {
          result = await speak(
            judge,
            attempt === 0 ? basePrompt : buildJudgePrompt({
              idea,
              round1,
              round2,
              language,
              hasSecondRound: Object.keys(round2).length > 0,
              previousErrors: verdictErrors,
            }),
            VERDICT_SCHEMA,
            overall.signal,
            false,
          )
        } catch (error) {
          if (userAborted) throw abortError()
          verdictErrors = [error?.message ?? '裁判调用失败']
          break
        }
        verdictRaw = asStructured(result)
        if (!verdictRaw || typeof verdictRaw !== 'object') {
          verdictErrors = [`裁判未提交结构化裁定（${describeMissing(result)}）`]
          continue
        }
        verdictErrors = validateVerdict(verdictRaw, { stances })
        if (verdictErrors.length === 0) {
          verdict = verdictRaw
          break
        }
      }
    } else {
      verdictErrors = ['没有任何辩手完成第 1 轮']
    }
    timings.judgeMs = now() - judgeStart
    onUpdate({ id, phase: 'judge', round1, round2, verdict })

    if (missingVoices.length > 0) {
      incompleteReasons.unshift(`缺少辩手陈词：${missingVoices.join('，')}`)
    }
    if (timedOut) incompleteReasons.push(`超过 ${hardStop}ms 时限，未完成部分未补齐`)
    if (verdict === null) {
      incompleteReasons.push(`裁判未产出合格裁定：${verdictErrors.join('；') || '未知原因'}`)
    }

    return {
      id,
      sessionId,
      title: titleOf(idea),
      idea,
      createdAt: new Date(startedAt).toISOString(),
      durationMs: Math.max(0, now() - startedAt),
      rounds: Object.keys(round2).length > 0 ? 2 : 1,
      participants: [
        ...debaters.filter((role) => role && role.id).map((role) => ({
          id: role.id,
          label: roleLabel(role, language),
          ...(role.provider && role.model ? { model: `${role.provider}/${role.model}` } : {}),
        })),
        { id: judge.id, label: roleLabel(judge, language) },
      ],
      round1,
      round2,
      verdict,
      verdictRaw,
      timings,
      incomplete: incompleteReasons.length > 0,
      incompleteReasons,
      warnings,
      language,
    }
  } finally {
    clearTimeout(softTimer)
    clearTimeout(hardTimer)
    signal?.removeEventListener('abort', onAbort)
    interruptAll()
  }
}

function abortError() {
  const error = new Error('辩论已取消')
  error.name = 'AbortError'
  return error
}

/**
 * Namespace claim ids by speaker so two debaters may both use `c1` without one
 * shadowing the other in the round-two claim map.
 */
function withPrefixedClaims(speakerId, speech) {
  return {
    ...speech,
    claims: (speech.claims ?? []).map((claim) => ({
      ...claim,
      ...(typeof claim?.id === 'string' ? { id: `${speakerId}:${claim.id}` } : {}),
    })),
  }
}

/** Final assistant text of a subagent result. */
function outputText(result) {
  const blocks = Array.isArray(result?.output) ? result.output : []
  return blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/**
 * Prefer the captured structured result, then accept a JSON object the child
 * printed as prose. The structured tool is the contract; this fallback only
 * rescues a run whose content is otherwise lost.
 */
function asStructured(result) {
  if (result?.structured && typeof result.structured === 'object') return result.structured
  const text = outputText(result)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function describeMissing(result) {
  const reason = result?.diagnostic ?? result?.stopReason ?? '未提交结构化结果'
  const text = outputText(result).replace(/\s+/g, ' ').slice(0, 120)
  return text ? `${reason}：${text}` : String(reason)
}
