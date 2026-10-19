/**
 * Semantic validation for debate outputs.
 *
 * The structured runtime already enforces the JSON-Schema shape; these checks
 * enforce the parts a schema cannot express: enough objections, evidence that
 * a reader can trace, a real rebuttal, and a decision that is actually a
 * decision. Every failure is a sentence the judge can act on when the engine
 * feeds it back for one retry.
 */

export const DECISIONS = ['go', 'conditional', 'no-go']
export const STANCES = ['support', 'oppose', 'mixed']
export const SEVERITIES = ['fatal', 'major', 'minor']
export const SCORE_KEYS = ['demand', 'feasibility', 'cost', 'risk']
export const MAX_IDEA_LENGTH = 4000

const FILE_PATTERN = /[A-Za-z]:\\|(?:^|[\s(])\.{0,2}\/|\.(?:js|ts|tsx|jsx|md|json|ya?ml|py|java|go|rs|cs|css|html)\b/
const SPEAKER_PATTERN = /第\s*\d+\s*轮|round\s*\d+|\b(?:advocate|skeptic|engineer|judge)\b|支持者|质疑者|工程可行性|裁判/i
const QUOTE_PATTERN = /[“”「」『』]|"[^"]{4,}"|'[^']{4,}'/
const FACT_PATTERN = /\d+\s*(?:%|％|万|亿|人|次|天|月|年|小时|分钟|元|倍)/

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/** Whether an evidence string names something a reader could check. */
export function looksTraceable(evidence) {
  if (typeof evidence !== 'string') return false
  const text = evidence.trim()
  if (text.length < 8) return false
  return FILE_PATTERN.test(text)
    || SPEAKER_PATTERN.test(text)
    || QUOTE_PATTERN.test(text)
    || FACT_PATTERN.test(text)
}

/**
 * Validate a round-one speech.
 * @param {unknown} value parsed structured output
 * @returns {string[]} actionable errors, empty when valid
 */
export function validateRound1(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['output must be a JSON object']
  const errors = []
  if (!STANCES.includes(value.stance)) errors.push(`stance must be one of ${STANCES.join(', ')}`)
  if (!nonEmpty(value.summary)) errors.push('summary must be a non-empty sentence')
  if (!Array.isArray(value.claims) || value.claims.length < 2) {
    errors.push('claims must contain at least 2 items')
  } else {
    const seen = new Set()
    value.claims.forEach((claim, index) => {
      if (!claim || typeof claim !== 'object') {
        errors.push(`claims[${index}] must be an object`)
        return
      }
      if (!nonEmpty(claim.id)) errors.push(`claims[${index}].id must be non-empty`)
      else if (seen.has(claim.id)) errors.push(`claims[${index}].id "${claim.id}" repeats`)
      else seen.add(claim.id)
      if (!nonEmpty(claim.text)) errors.push(`claims[${index}].text must be non-empty`)
    })
  }
  if (!Array.isArray(value.concerns) || value.concerns.length < 1) {
    errors.push('concerns must contain at least 1 concrete weakness')
  } else {
    value.concerns.forEach((concern, index) => {
      if (!concern || typeof concern !== 'object') {
        errors.push(`concerns[${index}] must be an object`)
        return
      }
      if (!nonEmpty(concern.claim)) errors.push(`concerns[${index}].claim must be non-empty`)
      if (!nonEmpty(concern.why)) errors.push(`concerns[${index}].why must be non-empty`)
    })
  }
  if (typeof value.confidence !== 'number' || Number.isNaN(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1')
  }
  return errors
}

/**
 * Validate a round-two rebuttal against the round-one claim map.
 * @param {unknown} value parsed structured output
 * @param {Map<string, { speaker: string, text: string }>} round1Claims claim id -> owner
 * @returns {string[]} actionable errors
 */
export function validateRound2(value, round1Claims) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['output must be a JSON object']
  const errors = []
  if (!STANCES.includes(value.revisedStance)) errors.push(`revisedStance must be one of ${STANCES.join(', ')}`)
  if (!Array.isArray(value.rebuttals) || value.rebuttals.length < 1) {
    errors.push('rebuttals must contain at least 1 named rebuttal')
  } else {
    value.rebuttals.forEach((rebuttal, index) => {
      if (!rebuttal || typeof rebuttal !== 'object') {
        errors.push(`rebuttals[${index}] must be an object`)
        return
      }
      if (!nonEmpty(rebuttal.targetClaimId)) {
        errors.push(`rebuttals[${index}].targetClaimId must be non-empty`)
        return
      }
      const owner = round1Claims.get(rebuttal.targetClaimId)
      if (!owner) {
        errors.push(`rebuttals[${index}].targetClaimId "${rebuttal.targetClaimId}" does not exist in round one`)
      } else if (nonEmpty(rebuttal.targetSpeaker) && rebuttal.targetSpeaker !== owner.speaker) {
        errors.push(`rebuttals[${index}].targetSpeaker "${rebuttal.targetSpeaker}" does not own claim "${rebuttal.targetClaimId}"`)
      }
      if (!nonEmpty(rebuttal.counter)) errors.push(`rebuttals[${index}].counter must be non-empty`)
    })
  }
  if (!Array.isArray(value.remainingConcerns)) errors.push('remainingConcerns must be an array')
  if (typeof value.changedMind !== 'boolean') errors.push('changedMind must be a boolean')
  return errors
}

/**
 * Validate the judge verdict.
 * @param {unknown} value parsed structured output
 * @param {{ stances?: string[] }} [context] round-one stances, to require disagreement records
 * @returns {string[]} actionable errors
 */
export function validateVerdict(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['output must be a JSON object']
  const errors = []
  if (!DECISIONS.includes(value.decision)) errors.push(`decision must be one of ${DECISIONS.join(', ')}`)
  if (!nonEmpty(value.summary)) errors.push('summary must be non-empty')
  if (!Array.isArray(value.conditions)) {
    errors.push('conditions must be an array')
  } else if (value.decision === 'conditional') {
    const usable = value.conditions.filter(nonEmpty)
    if (usable.length === 0) errors.push('decision "conditional" requires at least 1 executable condition')
  }
  if (!value.scores || typeof value.scores !== 'object' || Array.isArray(value.scores)) {
    errors.push('scores must be an object with demand, feasibility, cost, risk')
  } else {
    for (const key of SCORE_KEYS) {
      const score = value.scores[key]
      if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
        errors.push(`scores.${key} must be an integer from 1 to 5`)
      }
    }
  }
  if (!Array.isArray(value.shortcomings) || value.shortcomings.length < 2) {
    errors.push('shortcomings must contain at least 2 items')
  } else {
    value.shortcomings.forEach((shortcoming, index) => {
      if (!shortcoming || typeof shortcoming !== 'object') {
        errors.push(`shortcomings[${index}] must be an object`)
        return
      }
      if (!nonEmpty(shortcoming.claim)) errors.push(`shortcomings[${index}].claim must be non-empty`)
      if (!SEVERITIES.includes(shortcoming.severity)) {
        errors.push(`shortcomings[${index}].severity must be one of ${SEVERITIES.join(', ')}`)
      }
      if (!looksTraceable(shortcoming.evidence)) {
        errors.push(`shortcomings[${index}].evidence must quote a speaker/round, cite a file path, or state a concrete fact with a number`)
      }
      if (!nonEmpty(shortcoming.verify)) errors.push(`shortcomings[${index}].verify must be non-empty`)
    })
  }
  if (!Array.isArray(value.disagreements)) {
    errors.push('disagreements must be an array')
  } else {
    const stances = context.stances ?? []
    const distinct = new Set(stances.filter((stance) => stance !== 'mixed'))
    if (distinct.size > 1 && value.disagreements.length === 0) {
      errors.push('debaters ended on opposing stances, so disagreements must record at least 1 unresolved dispute')
    }
    value.disagreements.forEach((disagreement, index) => {
      if (!disagreement || typeof disagreement !== 'object') {
        errors.push(`disagreements[${index}] must be an object`)
        return
      }
      if (!nonEmpty(disagreement.topic)) errors.push(`disagreements[${index}].topic must be non-empty`)
      if (!Array.isArray(disagreement.positions) || disagreement.positions.length === 0) {
        errors.push(`disagreements[${index}].positions must list at least 1 position`)
      }
    })
  }
  if (!nonEmpty(value.nextStep)) errors.push('nextStep must name the smallest next validation step')
  if (typeof value.confidence !== 'number' || Number.isNaN(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1')
  }
  return errors
}

/** Build claim id -> owner map from round-one speeches. */
export function claimMap(round1) {
  const map = new Map()
  for (const [speaker, speech] of Object.entries(round1)) {
    for (const claim of speech?.claims ?? []) {
      if (nonEmpty(claim?.id)) map.set(claim.id, { speaker, text: claim.text })
    }
  }
  return map
}
