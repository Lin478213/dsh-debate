import test from 'node:test'
import assert from 'node:assert/strict'
import { runDebate, selectProvider } from '../lib/engine.js'

function speech(stance = 'oppose') {
  return {
    stance,
    summary: 'The idea is real but the cost is underestimated.',
    claims: [
      { id: 'c1', text: 'Weekly churn is rising.', evidence: 'docs/metrics.md' },
      { id: 'c2', text: 'Two teams already cover half of it.', evidence: '第 1 轮 engineer 说「已有模块」' },
    ],
    concerns: [{ claim: 'No owner after launch', why: 'Nobody is on call.' }],
    confidence: 0.65,
  }
}

function rebuttal(target = 'advocate:c1') {
  return {
    revisedStance: 'mixed',
    rebuttals: [{ targetSpeaker: 'advocate', targetClaimId: target, counter: 'The trend is seasonal.' }],
    remainingConcerns: ['Owner after launch'],
    changedMind: true,
  }
}

function verdict(overrides = {}) {
  return {
    decision: 'go',
    summary: 'The pilot is worth one sprint.',
    conditions: [],
    scores: { demand: 4, feasibility: 3, cost: 3, risk: 2 },
    shortcomings: [
      {
        claim: 'Cost ignores migration.',
        evidence: '第 2 轮 engineer 说「migration alone is two weeks」',
        severity: 'major',
        verify: 'Ask the platform owner.',
      },
      {
        claim: 'Demand rests on one interview.',
        evidence: 'docs/research.md',
        severity: 'fatal',
        verify: 'Run five more interviews.',
      },
    ],
    disagreements: [{ topic: 'Whether demand exists', positions: ['支持者: yes', '价值质疑者: no'] }],
    nextStep: 'Run a two-week flagged pilot.',
    confidence: 0.6,
    ...overrides,
  }
}

function fakeSubagents(results, { delay = 0 } = {}) {
  const calls = []
  const pending = new Map()
  return {
    calls,
    list: () => ['spawn'],
    getProvider: () => ({ capabilities: { outputSchema: true } }),
    interrupt: (id) => {
      const entry = pending.get(id)
      pending.delete(id)
      entry?.reject(new Error('interrupted'))
    },
    async startActivation(spec) {
      const roleId = spec.label.replace('debate:', '')
      const queue = results[roleId]
      const entry = Array.isArray(queue) ? queue.shift() : queue
      calls.push(roleId)
      const childId = spec.childId ?? `child-${calls.length}`
      const result = new Promise((resolve, reject) => {
        pending.set(childId, { reject })
        if (entry === 'hang') {
          spec.signal?.addEventListener('abort', () => {
            pending.delete(childId)
            reject(new Error('aborted'))
          }, { once: true })
          return
        }
        const timer = setTimeout(() => {
          pending.delete(childId)
          if (entry instanceof Error) reject(entry)
          else resolve({ structured: entry, output: [], stopReason: 'completed' })
        }, delay)
        spec.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          pending.delete(childId)
          reject(new Error('aborted'))
        }, { once: true })
      })
      return { childId, result, dispose: async () => {} }
    },
  }
}

function baseResults(overrides = {}) {
  return {
    advocate: [speech('support'), rebuttal()],
    skeptic: [speech('oppose'), rebuttal()],
    engineer: [speech('mixed'), rebuttal()],
    judge: [verdict()],
    ...overrides,
  }
}

const baseOptions = (results, extra = {}) => ({
  subagents: fakeSubagents(results),
  parent: { id: 'parent-1' },
  idea: '给 DSH 加一个每日回顾插件',
  cwd: 'E:\\proj',
  rounds: 2,
  timeLimitMs: 2000,
  softStopMs: 1500,
  ...extra,
})

test('selectProvider picks a provider that supports outputSchema', () => {
  const subagents = fakeSubagents({})
  assert.equal(selectProvider(subagents), 'spawn')
  assert.equal(selectProvider({ list: () => ['x'], getProvider: () => ({ capabilities: {} }) }), undefined)
})

test('runs both rounds and returns a valid verdict', async () => {
  const record = await runDebate(baseOptions(baseResults()))
  assert.equal(record.rounds, 2)
  assert.equal(record.incomplete, false)
  assert.equal(record.verdict.decision, 'go')
  assert.equal(record.participants.length, 4)
  assert.equal(record.round1.advocate.claims[0].id, 'advocate:c1')
  assert.ok(record.durationMs >= 0)
})

test('feeds validation errors back for one retry', async () => {
  const bad = verdict({ decision: 'conditional', conditions: [] })
  const record = await runDebate(baseOptions(baseResults({ judge: [bad, verdict()] })))
  assert.equal(record.verdict.decision, 'go')
  assert.equal(record.verdictRaw.decision, 'go')
})

test('never fabricates a verdict after two failed attempts', async () => {
  const bad = verdict({ decision: 'conditional', conditions: [] })
  const record = await runDebate(baseOptions(baseResults({ judge: [bad, bad] })))
  assert.equal(record.verdict, null)
  assert.equal(record.incomplete, true)
  assert.match(record.incompleteReasons.join('\n'), /裁判未产出合格裁定/)
})

test('records a missing voice instead of silently continuing', async () => {
  const record = await runDebate(baseOptions(baseResults({ advocate: [undefined] }), { rounds: 1 }))
  assert.equal(record.round1.advocate, undefined)
  assert.equal(record.incomplete, true)
  assert.match(record.incompleteReasons.join('\n'), /缺少辩手陈词/)
})

test('records a round-two rebuttal that fails its contract', async () => {
  const record = await runDebate(baseOptions(baseResults({
    engineer: [speech(), rebuttal('ghost:c9')],
    skeptic: [speech(), rebuttal('advocate:c1')],
    advocate: [speech('support'), rebuttal('advocate:c1')],
  })))
  assert.equal(record.incomplete, true)
  assert.match(record.warnings.join('\n'), /第 2 轮 engineer/)
  assert.match(record.incompleteReasons.join('\n'), /反驳不满足契约/)
})

test('a hung judge times out as incomplete, not as success', async () => {
  const record = await runDebate(baseOptions(baseResults({ judge: ['hang'] }), {
    timeLimitMs: 80,
    softStopMs: 50,
  }))
  assert.equal(record.verdict, null)
  assert.equal(record.incomplete, true)
  assert.match(record.incompleteReasons.join('\n'), /时限/)
})

test('rejects a composition with no structured-output provider', async () => {
  const subagents = {
    list: () => ['plain'],
    getProvider: () => ({ capabilities: {} }),
    startActivation: async () => ({ childId: 'c', result: Promise.resolve({}), dispose: async () => {} }),
  }
  await assert.rejects(
    () => runDebate({ ...baseOptions(baseResults()), subagents }),
    /no subagent provider supports structured output/,
  )
})
