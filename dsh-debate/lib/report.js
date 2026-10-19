/**
 * Markdown report rendering for one finished debate.
 *
 * The report is the durable artifact: the chat answer is a summary, the panel
 * is a viewer, and this file must stand alone when opened months later. It
 * therefore repeats the verdict, every shortcoming with its evidence, and the
 * full transcript in appendices.
 */

const LABELS = {
  zh: {
    title: '辩论',
    colon: '：',
    report: '报告',
    meta: '元数据',
    id: '编号',
    created: '开始时间',
    duration: '耗时',
    participants: '参与角色',
    rounds: '轮次',
    status: '状态',
    complete: '完整',
    incomplete: '不完整（见文末说明）',
    verdict: '结论',
    decision: { go: '做', conditional: '有条件做', 'no-go': '不做' },
    conditions: '成立条件',
    scores: '四维评分',
    scoreNames: { demand: '需求真实性', feasibility: '技术可行性', cost: '成本', risk: '风险' },
    shortcomings: '不足',
    severity: { fatal: '致命', major: '重要', minor: '次要' },
    evidence: '依据',
    verify: '如何验证',
    disagreements: '未解决的分歧',
    nextStep: '下一步',
    round1: '附录一：第 1 轮陈词',
    round2: '附录二：第 2 轮反驳',
    rawVerdict: '附录三：裁判原始输出',
    stance: '立场',
    stances: { support: '支持', oppose: '反对', mixed: '混合' },
    claims: '论点',
    concerns: '担忧',
    confidence: '置信度',
    rebuttals: '反驳',
    changedMind: '改变立场',
    yes: '是',
    no: '否',
    missing: '未能产出',
    incompleteReasons: '不完整说明',
    idea: '辩题',
  },
  en: {
    title: 'Debate',
    colon: ': ',
    report: 'Report',
    meta: 'Metadata',
    id: 'Id',
    created: 'Started',
    duration: 'Duration',
    participants: 'Participants',
    rounds: 'Rounds',
    status: 'Status',
    complete: 'Complete',
    incomplete: 'Incomplete (see notes)',
    verdict: 'Verdict',
    decision: { go: 'Go', conditional: 'Conditional', 'no-go': 'No-go' },
    conditions: 'Conditions',
    scores: 'Scores',
    scoreNames: { demand: 'Demand', feasibility: 'Feasibility', cost: 'Cost', risk: 'Risk' },
    shortcomings: 'Shortcomings',
    severity: { fatal: 'Fatal', major: 'Major', minor: 'Minor' },
    evidence: 'Evidence',
    verify: 'How to verify',
    disagreements: 'Unresolved disagreements',
    nextStep: 'Next step',
    round1: 'Appendix 1: Round one',
    round2: 'Appendix 2: Round two',
    rawVerdict: 'Appendix 3: Raw judge output',
    stance: 'Stance',
    stances: { support: 'Support', oppose: 'Oppose', mixed: 'Mixed' },
    claims: 'Claims',
    concerns: 'Concerns',
    confidence: 'Confidence',
    rebuttals: 'Rebuttals',
    changedMind: 'Changed mind',
    yes: 'Yes',
    no: 'No',
    missing: 'not produced',
    incompleteReasons: 'Incomplete notes',
    idea: 'Idea',
  },
}

const SEVERITY_ORDER = { fatal: 0, major: 1, minor: 2 }

function labels(language) {
  return LABELS[language] ?? LABELS.zh
}

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/** Build a filesystem-safe slug that keeps CJK characters. */
export function slugify(text, maxLength = 40) {
  const cleaned = String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, ' ')
    .replace(/[：；，。、！？（）【】《》“”‘’]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const sliced = cleaned.slice(0, maxLength).replace(/-$/, '')
  return sliced.length > 0 ? sliced : 'debate'
}

/** `YYYYMMDD-HHMMSS-slug.md` in local time. */
export function reportFileName(createdAt, idea) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${stamp}-${slugify(idea)}.md`
}

export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function decisionLabel(verdict, language) {
  const l = labels(language)
  return verdict?.decision ? l.decision[verdict.decision] ?? verdict.decision : l.missing
}

function renderScores(verdict, language) {
  const l = labels(language)
  const scores = verdict?.scores
  if (!scores) return ''
  const rows = ['demand', 'feasibility', 'cost', 'risk']
    .map((key) => `| ${l.scoreNames[key]} | ${cell(scores[key])} / 5 |`)
    .join('\n')
  return `## ${l.scores}\n\n|  |  |\n|---|---|\n${rows}\n`
}

function renderShortcomings(verdict, language) {
  const l = labels(language)
  const items = [...(verdict?.shortcomings ?? [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  )
  if (items.length === 0) return ''
  const body = items
    .map((item, index) => [
      `### ${index + 1}. [${l.severity[item.severity] ?? item.severity}] ${item.claim}`,
      '',
      `- ${l.evidence}${l.colon}${item.evidence}`,
      `- ${l.verify}${l.colon}${item.verify}`,
    ].join('\n'))
    .join('\n\n')
  return `## ${l.shortcomings}\n\n${body}\n`
}

function renderDisagreements(verdict, language) {
  const l = labels(language)
  const items = verdict?.disagreements ?? []
  if (items.length === 0) return ''
  const body = items
    .map((item) => `- **${item.topic}**\n${(item.positions ?? []).map((position) => `  - ${position}`).join('\n')}`)
    .join('\n')
  return `## ${l.disagreements}\n\n${body}\n`
}

function renderClaims(speech, language) {
  const l = labels(language)
  const claims = (speech?.claims ?? [])
    .map((claim) => `- \`${claim.id}\` ${claim.text}${claim.evidence ? `\n  - ${l.evidence}${l.colon}${claim.evidence}` : ''}`)
    .join('\n')
  const concerns = (speech?.concerns ?? [])
    .map((concern) => `- ${concern.claim} — ${concern.why}`)
    .join('\n')
  return [
    claims ? `**${l.claims}**\n\n${claims}` : '',
    concerns ? `**${l.concerns}**\n\n${concerns}` : '',
  ].filter(Boolean).join('\n\n')
}

function renderRound1(record, language) {
  const l = labels(language)
  const entries = Object.entries(record.round1 ?? {})
  if (entries.length === 0) return ''
  const body = entries
    .map(([speaker, speech]) => [
      `### ${speaker}`,
      '',
      `- ${l.stance}${l.colon}${l.stances[speech?.stance] ?? speech?.stance ?? '—'} · ${l.confidence}${l.colon}${speech?.confidence ?? '—'}`,
      '',
      speech?.summary ?? '',
      '',
      renderClaims(speech, language),
    ].join('\n'))
    .join('\n\n')
  return `## ${l.round1}\n\n${body}\n`
}

function renderRound2(record, language) {
  const l = labels(language)
  const entries = Object.entries(record.round2 ?? {})
  if (entries.length === 0) return ''
  const body = entries
    .map(([speaker, speech]) => {
      const rebuttals = (speech?.rebuttals ?? [])
        .map((rebuttal) => `- 对 \`${rebuttal.targetClaimId}\`（${rebuttal.targetSpeaker}）：${rebuttal.counter}`)
        .join('\n')
      const remaining = (speech?.remainingConcerns ?? []).map((concern) => `- ${concern}`).join('\n')
      return [
        `### ${speaker}`,
        '',
        `- ${l.stance}${l.colon}${l.stances[speech?.revisedStance] ?? speech?.revisedStance ?? '—'} · ${l.changedMind}${l.colon}${speech?.changedMind ? l.yes : l.no}`,
        '',
        rebuttals ? `**${l.rebuttals}**\n\n${rebuttals}` : '',
        remaining ? `**${l.concerns}**\n\n${remaining}` : '',
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
  return `## ${l.round2}\n\n${body}\n`
}

function renderIncomplete(record, language) {
  const l = labels(language)
  if (!record.incomplete) return ''
  const reasons = (record.incompleteReasons ?? []).map((reason) => `- ${reason}`).join('\n')
  return `> **${l.incompleteReasons}**\n>\n${reasons || '- —'}\n`
}

/** Render the full markdown report for one debate record. */
export function renderReport(record, language = 'zh') {
  const l = labels(language)
  const verdict = record.verdict
  const created = record.createdAt ? new Date(record.createdAt) : new Date()
  const participants = (record.participants ?? [])
    .map((participant) => `${participant.label ?? participant.id}${participant.model ? ` (${participant.model})` : ''}`)
    .join('、')

  const header = [
    `# ${l.title}${l.colon}${record.title ?? slugify(record.idea)}`,
    '',
    `| | |`,
    `|---|---|`,
    `| ${l.id} | \`${record.id}\` |`,
    `| ${l.created} | ${created.toISOString()} |`,
    `| ${l.duration} | ${formatDuration(record.durationMs)} |`,
    `| ${l.participants} | ${cell(participants)} |`,
    `| ${l.rounds} | ${record.rounds ?? '—'} |`,
    `| ${l.status} | ${record.incomplete ? l.incomplete : l.complete} |`,
    '',
  ].join('\n')

  const conditions = (verdict?.conditions ?? []).filter((condition) => condition?.trim())
  const verdictBlock = [
    `## ${l.verdict}${l.colon}${decisionLabel(verdict, language)}`,
    '',
    verdict?.summary ?? `_${l.missing}_`,
    conditions.length > 0 ? `\n**${l.conditions}**\n\n${conditions.map((condition) => `- ${condition}`).join('\n')}` : '',
    '',
  ].join('\n')

  const nextStep = verdict?.nextStep ? `## ${l.nextStep}\n\n${verdict.nextStep}\n` : ''
  const raw = verdict
    ? `## ${l.rawVerdict}\n\n\`\`\`json\n${JSON.stringify(verdict, null, 2)}\n\`\`\`\n`
    : ''

  return [
    header,
    renderIncomplete(record, language),
    `## ${l.idea}\n\n${record.idea ?? ''}\n`,
    verdictBlock,
    renderScores(verdict, language),
    renderShortcomings(verdict, language),
    renderDisagreements(verdict, language),
    nextStep,
    renderRound1(record, language),
    renderRound2(record, language),
    raw,
    '---',
    '',
    `_${record.reportPath ?? ''}_`,
    '',
  ].filter((part) => part !== '').join('\n')
}

/** Short chat-facing summary of one debate. */
export function renderSummary(record, language = 'zh') {
  const l = labels(language)
  const sep = language === 'en' ? '; ' : '；'
  const verdict = record.verdict
  if (!verdict) {
    return [
      `${l.verdict}${l.colon}${l.missing}`,
      `${l.status}${l.colon}${record.incomplete ? l.incomplete : l.complete}`,
      record.reportPath ? `${l.report}${l.colon}${record.reportPath}` : '',
    ].filter(Boolean).join('\n')
  }
  const top = [...(verdict.shortcomings ?? [])]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 3)
    .map((item, index) => `${index + 1}. [${l.severity[item.severity] ?? item.severity}] ${item.claim}`)
  return [
    `${l.verdict}${l.colon}${decisionLabel(verdict, language)}`,
    verdict.conditions?.length ? `${l.conditions}${l.colon}${verdict.conditions.join(sep)}` : '',
    top.length ? `${l.shortcomings}${l.colon}\n${top.join('\n')}` : '',
    record.incomplete ? `${l.status}${l.colon}${l.incomplete}（${(record.incompleteReasons ?? []).join(sep)}）` : '',
    record.reportPath ? `${l.report}${l.colon}${record.reportPath}` : '',
    `${l.id}${l.colon}${record.id}`,
  ].filter(Boolean).join('\n')
}
