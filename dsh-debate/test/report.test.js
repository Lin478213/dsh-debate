import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDuration,
  renderReport,
  renderSummary,
  reportFileName,
  slugify,
} from '../lib/report.js'

function record(overrides = {}) {
  return {
    id: 'd-1',
    title: '给 DSH 加一个每日回顾插件',
    idea: '给 DSH 加一个每日回顾插件，自动总结当天会话。',
    createdAt: '2026-10-19T12:00:00.000Z',
    durationMs: 42300,
    rounds: 2,
    participants: [
      { id: 'advocate', label: '支持者', model: 'deepseek-flash' },
      { id: 'skeptic', label: '价值质疑者' },
      { id: 'engineer', label: '工程可行性' },
    ],
    round1: {
      advocate: {
        stance: 'support',
        summary: '每天复盘能减少重复上下文。',
        claims: [{ id: 'c1', text: '会话切换频繁', evidence: 'docs/usage.md' }],
        concerns: [{ claim: '摘要可能失真', why: '模型会省略细节' }],
        confidence: 0.7,
      },
    },
    round2: {
      engineer: {
        revisedStance: 'mixed',
        rebuttals: [{ targetSpeaker: 'advocate', targetClaimId: 'c1', counter: '切换次数没有数据支撑。' }],
        remainingConcerns: ['摘要成本'],
        changedMind: true,
      },
    },
    verdict: {
      decision: 'conditional',
      summary: '可以做，但先验证摘要准确性。',
      conditions: ['只对超过 20 轮的会话生成'],
      scores: { demand: 4, feasibility: 3, cost: 3, risk: 2 },
      shortcomings: [
        {
          claim: '摘要可能漏掉关键决策',
          evidence: '第 2 轮 engineer 说「摘要会压缩掉上下文」',
          severity: 'major',
          verify: '对比十场会话的人工摘要',
        },
        {
          claim: '没有需求数据',
          evidence: '支持者 c1 只给出一个例子',
          severity: 'fatal',
          verify: '统计一周的会话切换次数',
        },
      ],
      disagreements: [{ topic: '需求是否存在', positions: ['支持者: 存在', '质疑者: 未证明'] }],
      nextStep: '先做一周的影子运行。',
      confidence: 0.55,
    },
    incomplete: false,
    incompleteReasons: [],
    language: 'zh',
    reportPath: 'E:\\proj\\.debate\\report.md',
    ...overrides,
  }
}

test('slugify keeps CJK and strips unsafe characters', () => {
  assert.equal(slugify('给 DSH 加/一个：每日回顾?'), '给-DSH-加-一个-每日回顾')
  assert.equal(slugify('   '), 'debate')
  assert.equal(slugify('a'.repeat(80)).length, 40)
})

test('reportFileName uses a sortable stamp and the slug', () => {
  const name = reportFileName(new Date(2026, 9, 19, 8, 5, 3), '每日回顾')
  assert.equal(name, '20261019-080503-每日回顾.md')
})

test('formatDuration renders ms, seconds, and minutes', () => {
  assert.equal(formatDuration(800), '800ms')
  assert.equal(formatDuration(42300), '42.3s')
  assert.equal(formatDuration(125000), '2m 5s')
  assert.equal(formatDuration(undefined), '—')
})

test('renders verdict, conditions, scores, and sorted shortcomings', () => {
  const text = renderReport(record())
  assert.match(text, /结论：有条件做/)
  assert.match(text, /只对超过 20 轮的会话生成/)
  assert.match(text, /\| 需求真实性 \| 4 \/ 5 \|/)
  assert.ok(text.indexOf('[致命]') < text.indexOf('[重要]'), 'fatal shortcoming sorts first')
  assert.match(text, /对比十场会话的人工摘要/)
  assert.match(text, /未解决的分歧/)
  assert.match(text, /附录一：第 1 轮陈词/)
  assert.match(text, /附录二：第 2 轮反驳/)
  assert.match(text, /附录三：裁判原始输出/)
})

test('marks an incomplete debate instead of hiding it', () => {
  const text = renderReport(record({ incomplete: true, incompleteReasons: ['第 2 轮超时'] }))
  assert.match(text, /不完整/)
  assert.match(text, /第 2 轮超时/)
})

test('renders a missing verdict honestly', () => {
  const text = renderReport(record({ verdict: null, incomplete: true, incompleteReasons: ['裁判失败'] }))
  assert.match(text, /结论：未能产出/)
  assert.match(text, /裁判失败/)
})

test('summary lists the top shortcomings and the report path', () => {
  const text = renderSummary(record())
  assert.match(text, /结论：有条件做/)
  assert.match(text, /\[致命\] 没有需求数据/)
  assert.match(text, /报告：E:\\proj/)
  assert.match(text, /编号：d-1/)
})

test('english report uses english labels', () => {
  const text = renderReport(record(), 'en')
  assert.match(text, /Verdict: Conditional/)
  assert.match(text, /Appendix 1: Round one/)
})
