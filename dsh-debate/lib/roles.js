/**
 * Default debate roster.
 *
 * Three lenses: whether the idea is worth doing, whether the demand is real,
 * and whether it can be built. The judge never debates; it only reads.
 */

export const DEFAULT_DEBATERS = [
  {
    id: 'advocate',
    label: { zh: '支持者', en: 'Advocate' },
    brief: {
      zh: '你负责把想法最有说服力的一面说清楚：它解决什么问题、为什么现在做、成立需要哪些条件。不要回避成本，但也不要替对手论证。',
      en: 'Make the strongest honest case: what problem it solves, why now, and what must hold for it to work. Do not hide costs, but do not argue the opponent side.',
    },
  },
  {
    id: 'skeptic',
    label: { zh: '价值质疑者', en: 'Value skeptic' },
    brief: {
      zh: '你负责攻击需求本身：谁会真的用、现有替代方案是什么、为什么用户会改变习惯。不要泛泛怀疑，每条质疑都要能落到具体人群或行为。',
      en: 'Attack the demand itself: who would really use it, what alternatives exist, and why anyone would change behavior. Every doubt must land on a concrete user or behavior.',
    },
  },
  {
    id: 'engineer',
    label: { zh: '工程可行性', en: 'Engineer' },
    brief: {
      zh: '你负责攻击实现：依赖、迁移、运维、失败模式、最坏情况。区分「难」和「不知道」，给出量级判断而不是形容词。',
      en: 'Attack delivery: dependencies, migration, operations, failure modes, worst cases. Separate "hard" from "unknown", and give orders of magnitude, not adjectives.',
    },
  },
]

export const DEFAULT_JUDGE = {
  id: 'judge',
  label: { zh: '裁判', en: 'Judge' },
  brief: {
    zh: '你是独立裁判，不参与辩论。只依据记录裁定，不引入记录里没有的事实。你的任务是把分歧收敛成一个明确结论，并保留真正没解决的分歧。',
    en: 'You are the independent judge and do not debate. Decide only from the transcript, never introducing facts it does not contain. Converge the dispute into one explicit decision and keep the disagreements that remain.',
  },
}

/** Pick the localized label, falling back to the id. */
export function roleLabel(role, language = 'zh') {
  if (!role?.label) return role?.id ?? 'unknown'
  if (typeof role.label === 'string') return role.label
  return role.label[language] ?? role.label.zh ?? role.id
}

/** Pick the localized brief, falling back to the Chinese one. */
export function roleBrief(role, language = 'zh') {
  if (!role?.brief) return ''
  if (typeof role.brief === 'string') return role.brief
  return role.brief[language] ?? role.brief.zh ?? ''
}
