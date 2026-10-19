window.__ModuleLoader__.load({
  id: '@local/dsh-debate',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'dsh-debate'
    const API = '/plugins/dsh-debate/api/state'

    const ZH = {
      title: '辩论台',
      subtitle: '多 agent 交叉质询：可行性、不足与未解决的分歧。',
      live: '进行中',
      done: '最近完成',
      history: '历史辩论',
      empty: '还没有辩论记录。在对话里让我「辩一下这个想法」，或输入 /debate <想法>。',
      idle: '当前没有进行中的辩论。',
      'phase.round1': '第 1 轮陈词',
      'phase.round2': '第 2 轮反驳',
      'phase.judge': '裁判裁定中',
      'phase.done': '已完成',
      waiting: '等待中',
      missing: '未产出',
      'decision.go': '做',
      'decision.conditional': '有条件做',
      'decision.no-go': '不做',
      'decision.none': '未裁定',
      conditions: '成立条件',
      scores: '四维评分',
      'score.demand': '需求真实性',
      'score.feasibility': '技术可行性',
      'score.cost': '成本',
      'score.risk': '风险',
      shortcomings: '不足',
      'severity.fatal': '致命',
      'severity.major': '重要',
      'severity.minor': '次要',
      disagreements: '未解决的分歧',
      nextStep: '下一步',
      report: '报告',
      incomplete: '不完整',
      back: '返回',
      loading: '加载中…',
      error: '加载失败',
      retry: '重试',
      claims: '论点',
      concerns: '担忧',
      rebuttals: '反驳',
      transcript: '全程记录',
      evidence: '依据',
      verify: '如何验证',
      noVerdict: '裁判未产出合格裁定。',
      verdict: '结论',
      'stance.support': '支持',
      'stance.oppose': '反对',
      'stance.mixed': '混合',
      'phaseLabel.round1': '第 1 轮',
      'phaseLabel.round2': '第 2 轮',
      'changedMind.yes': '改变立场',
      'changedMind.no': '立场未变',
      updated: '更新于',
      refresh: '刷新',
    }

    const EN = {
      title: 'Debate Stage',
      subtitle: 'Cross-examination between agents: feasibility, weaknesses, and what stayed unresolved.',
      live: 'Running',
      done: 'Just finished',
      history: 'Past debates',
      empty: 'No debates yet. Ask me to debate an idea in the conversation, or type /debate <idea>.',
      idle: 'No debate is running right now.',
      'phase.round1': 'Round 1 statements',
      'phase.round2': 'Round 2 rebuttals',
      'phase.judge': 'Judge deliberating',
      'phase.done': 'Finished',
      waiting: 'Waiting',
      missing: 'Not produced',
      'decision.go': 'Go',
      'decision.conditional': 'Conditional',
      'decision.no-go': 'No-go',
      'decision.none': 'No verdict',
      conditions: 'Conditions',
      scores: 'Scores',
      'score.demand': 'Demand',
      'score.feasibility': 'Feasibility',
      'score.cost': 'Cost',
      'score.risk': 'Risk',
      shortcomings: 'Shortcomings',
      'severity.fatal': 'Fatal',
      'severity.major': 'Major',
      'severity.minor': 'Minor',
      disagreements: 'Unresolved disagreements',
      nextStep: 'Next step',
      report: 'Report',
      incomplete: 'Incomplete',
      back: 'Back',
      loading: 'Loading…',
      error: 'Failed to load',
      retry: 'Retry',
      claims: 'Claims',
      concerns: 'Concerns',
      rebuttals: 'Rebuttals',
      transcript: 'Transcript',
      evidence: 'Evidence',
      verify: 'How to verify',
      noVerdict: 'The judge produced no valid verdict.',
      verdict: 'Verdict',
      'stance.support': 'Support',
      'stance.oppose': 'Oppose',
      'stance.mixed': 'Mixed',
      'phaseLabel.round1': 'Round 1',
      'phaseLabel.round2': 'Round 2',
      'changedMind.yes': 'changed mind',
      'changedMind.no': 'held position',
      updated: 'updated',
      refresh: 'Refresh',
    }

    let translate = (key) => key
    const t = (key) => translate(key)

    const S = {
      page: {
        height: '100%',
        overflowY: 'auto',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      },
      wrap: { maxWidth: 1040, margin: '0 auto', padding: '28px 32px 48px' },
      header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
      h1: { fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' },
      subtitle: { margin: '6px 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 1.5 },
      card: {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 12,
      },
      speech: {
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        padding: '12px 13px',
        minWidth: 0,
      },
      summary: { fontSize: 13, lineHeight: 1.6, margin: '6px 0 0' },
      muted: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 },
      sectionTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 8px' },
      list: { margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 },
      row: {
        display: 'flex',
        width: '100%',
        background: 'transparent',
        border: 0,
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        padding: '10px 2px',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      },
      button: {
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '5px 10px',
        fontSize: 12,
        cursor: 'pointer',
      },
      linkButton: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        padding: 0,
        fontSize: 13,
        cursor: 'pointer',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
      scoreGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 10 },
      scoreCell: {
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 8,
        padding: '8px 10px',
        textAlign: 'center',
      },
      error: {
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        marginBottom: 12,
      },
    }

    function badge(text, color) {
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 8px',
          borderRadius: 999,
          border: `1px solid ${color}`,
          color,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
        },
      }, text)
    }

    function decisionColor(decision) {
      if (decision === 'go') return 'var(--dsw-alias-state-success-primary)'
      if (decision === 'conditional') return 'var(--dsw-alias-state-warn-primary)'
      if (decision === 'no-go') return 'var(--dsw-alias-state-error-primary)'
      return 'var(--dsw-alias-label-secondary)'
    }

    function severityColor(severity) {
      if (severity === 'fatal') return 'var(--dsw-alias-state-error-primary)'
      if (severity === 'major') return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-label-secondary)'
    }

    function stanceColor(stance) {
      if (stance === 'support') return 'var(--dsw-alias-state-success-primary)'
      if (stance === 'oppose') return 'var(--dsw-alias-state-error-primary)'
      return 'var(--dsw-alias-state-warn-primary)'
    }

    function formatTime(value) {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString()
    }

    async function getJson(url) {
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return response.json()
    }

    function section(title, body) {
      if (!body) return null
      return h('div', { style: { marginTop: 16 } },
        h('div', { style: S.sectionTitle }, title),
        body,
      )
    }

    function scoresGrid(scores) {
      if (!scores) return null
      return h('div', { style: S.scoreGrid },
        ['demand', 'feasibility', 'cost', 'risk'].map((key) => h('div', { key, style: S.scoreCell },
          h('div', { style: { fontSize: 18, fontWeight: 600 } }, String(scores[key] ?? '—')),
          h('div', { style: { ...S.muted, marginTop: 2 } }, t(`score.${key}`)),
        )),
      )
    }

    function SpeakerCard({ role, entry }) {
      const round1 = entry.round1 ? entry.round1[role.id] : undefined
      const round2 = entry.round2 ? entry.round2[role.id] : undefined
      const stance = round2 ? round2.revisedStance : round1 ? round1.stance : undefined
      return h('div', { style: S.speech },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('span', { style: { fontSize: 12, fontWeight: 600 } }, role.label),
          stance ? badge(t(`stance.${stance}`), stanceColor(stance)) : badge(t('waiting'), 'var(--dsw-alias-label-secondary)'),
        ),
        round1
          ? h('div', { style: S.summary }, round1.summary)
          : h('div', { style: { ...S.muted, marginTop: 6 } }, t('missing')),
        round2
          ? h('div', { style: { ...S.muted, marginTop: 8 } },
            `${t('phaseLabel.round2')} · ${t(`stance.${round2.revisedStance}`)} · ${round2.changedMind ? t('changedMind.yes') : t('changedMind.no')} · ${t('rebuttals')} ${Array.isArray(round2.rebuttals) ? round2.rebuttals.length : 0}`)
          : null,
      )
    }

    function LiveCard({ entry, roles }) {
      const phase = entry.phase === 'done' ? t('phase.done') : t(`phase.${entry.phase ?? 'round1'}`)
      const speakers = roles.filter((role) => role.id !== 'judge')
      return h('div', { style: S.card },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 } },
          h('div', { style: { fontSize: 13, fontWeight: 600, minWidth: 0 } }, entry.title ?? ''),
          h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
            badge(phase, 'var(--dsw-alias-brand-primary)'),
            entry.incomplete ? badge(t('incomplete'), 'var(--dsw-alias-state-warn-primary)') : null,
          ),
        ),
        h('div', { style: { ...S.grid, marginTop: 12 } },
          speakers.map((role) => h(SpeakerCard, { key: role.id, role, entry })),
        ),
        entry.verdict
          ? h('div', { style: { marginTop: 14, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              badge(t(`decision.${entry.verdict.decision}`), decisionColor(entry.verdict.decision)),
              h('span', { style: { fontSize: 12, fontWeight: 600 } }, t('verdict')),
            ),
            h('div', { style: S.summary }, entry.verdict.summary),
          )
          : null,
      )
    }

    function HistoryRow({ row, onOpen }) {
      return h('button', { type: 'button', style: S.row, onClick: () => onOpen(row.id) },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' } },
          badge(t(`decision.${row.decision ?? 'none'}`), decisionColor(row.decision)),
          h('div', { style: { minWidth: 0, flex: 1, textAlign: 'left' } },
            h('div', {
              style: { fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }, row.title ?? row.id),
            h('div', { style: { ...S.muted, marginTop: 2 } },
              `${formatTime(row.createdAt)}${row.incomplete ? ` · ${t('incomplete')}` : ''}`),
          ),
        ),
      )
    }

    function Transcript({ round1, round2 }) {
      const speakers = new Set([...Object.keys(round1 ?? {}), ...Object.keys(round2 ?? {})])
      if (speakers.size === 0) return null
      return section(t('transcript'), h('div', {},
        [...speakers].map((speaker) => {
          const first = round1 ? round1[speaker] : undefined
          const second = round2 ? round2[speaker] : undefined
          return h('details', { key: speaker, style: { marginTop: 8 } },
            h('summary', { style: { cursor: 'pointer', fontSize: 13, fontWeight: 500 } }, speaker),
            first
              ? h('div', { style: { marginTop: 6 } },
                h('div', { style: S.muted }, `${t('claims')}:`),
                h('ul', { style: S.list }, (first.claims ?? []).map((claim) => h('li', { key: claim.id },
                  h('span', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, claim.id + ' '),
                  claim.text,
                  claim.evidence ? h('div', { style: S.muted }, `${t('evidence')}: ${claim.evidence}`) : null,
                ))),
              )
              : null,
            second
              ? h('div', { style: { marginTop: 8 } },
                h('div', { style: S.muted }, `${t('rebuttals')}:`),
                h('ul', { style: S.list }, (second.rebuttals ?? []).map((rebuttal, index) => h('li', { key: index },
                  `${rebuttal.targetClaimId} (${rebuttal.targetSpeaker}): ${rebuttal.counter}`,
                ))),
              )
              : null,
          )
        }),
      ))
    }

    function Detail({ record, onBack }) {
      const verdict = record.verdict
      return h('div', {},
        h('button', { type: 'button', style: S.linkButton, onClick: onBack }, `← ${t('back')}`),
        h('h2', { style: { fontSize: 16, fontWeight: 600, margin: '12px 0 4px' } }, record.title ?? record.idea ?? record.id),
        h('div', { style: S.muted }, `${formatTime(record.createdAt)} · ${record.incomplete ? t('incomplete') : t('phase.done')}`),
        verdict
          ? h('div', { style: { ...S.card, marginTop: 14 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              badge(t(`decision.${verdict.decision}`), decisionColor(verdict.decision)),
              h('span', { style: { fontSize: 12, fontWeight: 600 } }, t('verdict')),
            ),
            h('div', { style: S.summary }, verdict.summary),
            scoresGrid(verdict.scores),
            section(t('conditions'), (verdict.conditions ?? []).length
              ? h('ul', { style: S.list }, verdict.conditions.map((condition, index) => h('li', { key: index }, condition)))
              : null),
            section(t('shortcomings'), (verdict.shortcomings ?? []).length
              ? h('div', {}, verdict.shortcomings.map((item, index) => h('div', { key: index, style: { marginTop: 10 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  badge(t(`severity.${item.severity}`), severityColor(item.severity)),
                  h('span', { style: { fontSize: 13, fontWeight: 500 } }, item.claim),
                ),
                h('div', { style: S.muted }, `${t('evidence')}: ${item.evidence}`),
                h('div', { style: S.muted }, `${t('verify')}: ${item.verify}`),
              )))
              : null),
            section(t('disagreements'), (verdict.disagreements ?? []).length
              ? h('div', {}, verdict.disagreements.map((item, index) => h('div', { key: index, style: { marginTop: 8 } },
                h('div', { style: { fontSize: 13, fontWeight: 500 } }, item.topic),
                h('ul', { style: S.list }, (item.positions ?? []).map((position, positionIndex) => h('li', { key: positionIndex }, position))),
              )))
              : null),
            section(t('nextStep'), verdict.nextStep ? h('div', { style: S.summary }, verdict.nextStep) : null),
          )
          : h('div', { style: { ...S.card, marginTop: 14 } }, t('noVerdict')),
        (record.incompleteReasons ?? []).length
          ? section(t('incomplete'), h('ul', { style: S.list }, record.incompleteReasons.map((reason, index) => h('li', { key: index }, reason))))
          : null,
        record.reportPath
          ? h('div', { style: { ...S.muted, marginTop: 14, wordBreak: 'break-all' } }, `${t('report')}: ${record.reportPath}`)
          : null,
        Transcript({ round1: record.round1, round2: record.round2 }),
      )
    }

    function DebatePanel() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [detail, setDetail] = useState(null)
      const [markdown, setMarkdown] = useState('')

      const load = useCallback(async () => {
        try {
          const next = await getJson(API)
          setData(next)
          setError('')
        } catch (failure) {
          setError(String(failure && failure.message ? failure.message : failure))
        }
      }, [])

      useEffect(() => {
        let alive = true
        load()
        const timer = setInterval(() => {
          if (alive) load()
        }, 1000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [load])

      const open = useCallback(async (id) => {
        try {
          const result = await getJson(`${API}?id=${encodeURIComponent(id)}`)
          if (result.record) {
            setDetail(result.record)
            setMarkdown('')
          } else if (result.markdown) {
            setDetail(null)
            setMarkdown(result.markdown)
          } else {
            setError(t('error'))
          }
        } catch (failure) {
          setError(String(failure && failure.message ? failure.message : failure))
        }
      }, [])

      if (markdown) {
        return h('div', { style: S.page }, h('div', { style: S.wrap },
          h('button', { type: 'button', style: S.linkButton, onClick: () => setMarkdown('') }, `← ${t('back')}`),
          h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, marginTop: 12 } }, markdown),
        ))
      }

      if (detail) {
        return h('div', { style: S.page }, h('div', { style: S.wrap },
          h(Detail, { record: detail, onBack: () => setDetail(null) }),
        ))
      }

      const live = data ? data.live ?? [] : []
      const history = data ? data.history ?? [] : []
      const roles = data ? data.roles ?? [] : []
      const running = live.filter((entry) => entry.phase !== 'done')

      return h('div', { style: S.page }, h('div', { style: S.wrap },
        h('div', { style: S.header },
          h('div', {},
            h('h1', { style: S.h1 }, t('title')),
            h('p', { style: S.subtitle }, t('subtitle')),
          ),
          h('button', { type: 'button', style: S.button, onClick: load }, t('refresh')),
        ),
        error ? h('div', { style: S.error }, `${t('error')}: ${error}`) : null,
        !data && !error ? h('div', { style: S.muted }, t('loading')) : null,
        running.length > 0
          ? section(t('live'), h('div', {}, running.map((entry) => h(LiveCard, { key: entry.id, entry, roles }))))
          : data
            ? h('div', { style: { ...S.muted, marginBottom: 16 } }, t('idle'))
            : null,
        live.filter((entry) => entry.phase === 'done').map((entry) => h(LiveCard, { key: entry.id, entry, roles })),
        section(t('history'), history.length > 0
          ? h('div', { style: S.card }, history.map((row) => h(HistoryRow, { key: row.id, row, onOpen: open })))
          : h('div', { style: S.card }, t('empty'))),
      ))
    }

    function DebateIcon(props) {
      const size = (props && props.size) || 20
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'currentColor',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', {
        d: 'M3 4h11a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H8l-4 3v-3H3V4z',
        opacity: 0.9,
      }),
      h('path', {
        d: 'M10 11h8a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-1v2l-3-2h-4a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z',
        opacity: 0.55,
      }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Read the active language once, guarded: a missing locale service must
        // never turn into a boot failure. No dictionary registration, so a
        // second activation cannot collide with the first.
        let language = 'zh'
        try {
          const active = ctx.locale.getLocale().active
          language = String(active).toLowerCase().startsWith('en') ? 'en' : 'zh'
        } catch (error) {
          console.error('[dsh-debate] locale lookup failed, falling back to zh', error)
        }
        const dictionary = language === 'en' ? EN : ZH
        translate = (key) => dictionary[key] ?? key

        try {
          ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'debate' }, DebatePanel))
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'debate',
            order: 20,
            label: () => t('title'),
          }, DebateIcon))
        } catch (error) {
          console.error('[dsh-debate] slot registration failed', error)
        }
      },
    }
  },
})
