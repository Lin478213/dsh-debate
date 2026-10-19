import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claimMap,
  looksTraceable,
  validateRound1,
  validateRound2,
  validateVerdict,
} from '../lib/verdict.js'

function round1() {
  return {
    stance: 'oppose',
    summary: 'The idea is real but the cost is underestimated.',
    claims: [
      { id: 'c1', text: 'Weekly churn is rising.', evidence: 'docs/metrics.md' },
      { id: 'c2', text: 'Two teams already cover half of it.', evidence: '第 1 轮 engineer 提到的 modules' },
    ],
    concerns: [{ claim: 'No owner after launch', why: 'Nobody is on call.' }],
    confidence: 0.7,
  }
}

function verdict(overrides = {}) {
  return {
    decision: 'conditional',
    summary: 'Worth a bounded pilot only if the retention hypothesis holds.',
    conditions: ['Ship behind a flag', 'Recheck after 4 weeks'],
    scores: { demand: 3, feasibility: 4, cost: 3, risk: 3 },
    shortcomings: [
      {
        claim: 'The cost estimate ignores migration.',
        evidence: '第 2 轮 engineer 说「migration alone is two weeks」',
        severity: 'major',
        verify: 'Ask the platform owner for a migration estimate.',
      },
      {
        claim: 'Demand is inferred from one interview.',
        evidence: '支持者 c1 只引用了一个用户',
        severity: 'fatal',
        verify: 'Run five more interviews.',
      },
    ],
    disagreements: [
      { topic: 'Whether demand exists', positions: ['支持者: yes', '价值质疑者: no'] },
    ],
    nextStep: 'Run a two-week flagged pilot with five users.',
    confidence: 0.6,
    ...overrides,
  }
}

test('accepts a well-formed round-one speech', () => {
  assert.deepEqual(validateRound1(round1()), [])
})

test('rejects a round-one speech with fewer than two claims', () => {
  const speech = round1()
  speech.claims = [speech.claims[0]]
  assert.match(validateRound1(speech).join('\n'), /at least 2/)
})

test('rejects duplicate claim ids', () => {
  const speech = round1()
  speech.claims[1].id = 'c1'
  assert.match(validateRound1(speech).join('\n'), /repeats/)
})

test('accepts a round-two rebuttal that targets a real claim', () => {
  const speech = {
    revisedStance: 'mixed',
    rebuttals: [{ targetSpeaker: 'advocate', targetClaimId: 'c1', counter: 'The trend is seasonal.' }],
    remainingConcerns: ['Owner after launch'],
    changedMind: true,
  }
  assert.deepEqual(validateRound2(speech, claimMap({ advocate: round1() })), [])
})

test('rejects a rebuttal whose target claim does not exist', () => {
  const speech = {
    revisedStance: 'mixed',
    rebuttals: [{ targetSpeaker: 'advocate', targetClaimId: 'c9', counter: 'No such claim.' }],
    remainingConcerns: [],
    changedMind: false,
  }
  assert.match(validateRound2(speech, claimMap({ advocate: round1() })).join('\n'), /does not exist/)
})

test('rejects a rebuttal attributed to the wrong speaker', () => {
  const speech = {
    revisedStance: 'mixed',
    rebuttals: [{ targetSpeaker: 'skeptic', targetClaimId: 'c1', counter: 'Wrong owner.' }],
    remainingConcerns: [],
    changedMind: false,
  }
  assert.match(validateRound2(speech, claimMap({ advocate: round1() })).join('\n'), /does not own/)
})

test('accepts a complete verdict', () => {
  assert.deepEqual(validateVerdict(verdict(), { stances: ['support', 'oppose', 'mixed'] }), [])
})

test('rejects an undefined decision', () => {
  assert.match(validateVerdict(verdict({ decision: 'maybe' })).join('\n'), /decision must be one of/)
})

test('requires conditions for a conditional decision', () => {
  assert.match(validateVerdict(verdict({ conditions: [] })).join('\n'), /requires at least 1/)
})

test('requires at least two shortcomings', () => {
  const value = verdict()
  value.shortcomings = [value.shortcomings[0]]
  assert.match(validateVerdict(value).join('\n'), /at least 2/)
})

test('rejects vague evidence', () => {
  const value = verdict()
  value.shortcomings[0].evidence = '可能有性能问题'
  assert.match(validateVerdict(value).join('\n'), /evidence must quote/)
})

test('accepts a file path, a quote, and a fact with a number as evidence', () => {
  assert.equal(looksTraceable('see src/auth/session.ts'), true)
  assert.equal(looksTraceable('第 2 轮 engineer 说「迁移要两周」'), true)
  assert.equal(looksTraceable('用户调研显示 68% 的人每周只用一次'), true)
  assert.equal(looksTraceable('probably slow'), false)
})

test('rejects out-of-range and fractional scores', () => {
  const value = verdict()
  value.scores.risk = 6
  value.scores.cost = 3.5
  const errors = validateVerdict(value).join('\n')
  assert.match(errors, /scores\.risk/)
  assert.match(errors, /scores\.cost/)
})

test('requires disagreements when debaters ended opposed', () => {
  assert.match(
    validateVerdict(verdict({ disagreements: [] }), { stances: ['support', 'oppose'] }).join('\n'),
    /opposing stances/,
  )
})

test('does not require disagreements when everyone agreed', () => {
  assert.deepEqual(
    validateVerdict(verdict({ disagreements: [] }), { stances: ['support', 'support'] }),
    [],
  )
})

test('requires a next step', () => {
  assert.match(validateVerdict(verdict({ nextStep: '  ' })).join('\n'), /nextStep/)
})

test('claimMap records the owning speaker', () => {
  const map = claimMap({ advocate: round1() })
  assert.equal(map.get('c1').speaker, 'advocate')
  assert.equal(map.get('c1').text, 'Weekly churn is rising.')
})
