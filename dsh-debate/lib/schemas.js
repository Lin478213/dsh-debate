/**
 * Structured-output schemas handed to subagent children.
 *
 * Kept to the conservative JSON-Schema subset the scoped structured runtime
 * validates (type / properties / required / additionalProperties / items /
 * enum). Counts and ranges are enforced in `verdict.js`, not here.
 */

export const ROUND1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stance', 'summary', 'claims', 'concerns', 'confidence'],
  properties: {
    stance: {
      type: 'string',
      enum: ['support', 'oppose', 'mixed'],
      description: 'Your overall position on the idea.',
    },
    summary: {
      type: 'string',
      description: 'Two to four sentences: your case in your own words.',
    },
    claims: {
      type: 'array',
      description: 'At least two verifiable claims that carry your case.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: {
          id: { type: 'string', description: 'Short stable id, e.g. c1.' },
          text: { type: 'string', description: 'The claim itself.' },
          evidence: {
            type: 'string',
            description: 'A file path, a quote, or a concrete fact that supports it.',
          },
        },
      },
    },
    concerns: {
      type: 'array',
      description: 'At least one concrete weakness you see in the idea.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'why'],
        properties: {
          claim: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
    confidence: {
      type: 'number',
      description: '0 to 1.',
    },
  },
}

export const ROUND2_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['revisedStance', 'rebuttals', 'remainingConcerns', 'changedMind'],
  properties: {
    revisedStance: {
      type: 'string',
      enum: ['support', 'oppose', 'mixed'],
      description: 'Your position after reading the others.',
    },
    rebuttals: {
      type: 'array',
      description: 'At least one direct rebuttal naming an opponent claim id.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['targetSpeaker', 'targetClaimId', 'counter'],
        properties: {
          targetSpeaker: { type: 'string', description: 'Role id of the opponent.' },
          targetClaimId: { type: 'string', description: 'The claim id from round one.' },
          counter: { type: 'string', description: 'Why that claim fails or is incomplete.' },
        },
      },
    },
    remainingConcerns: {
      type: 'array',
      description: 'Concerns that survived the exchange.',
      items: { type: 'string' },
    },
    changedMind: {
      type: 'boolean',
      description: 'Whether the exchange moved your position.',
    },
  },
}

export const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'decision',
    'summary',
    'conditions',
    'scores',
    'shortcomings',
    'disagreements',
    'nextStep',
    'confidence',
  ],
  properties: {
    decision: {
      type: 'string',
      enum: ['go', 'conditional', 'no-go'],
      description: 'go: build it; conditional: build only if the conditions hold; no-go: do not build.',
    },
    summary: {
      type: 'string',
      description: 'Three to six sentences justifying the decision from the transcript.',
    },
    conditions: {
      type: 'array',
      description: 'Executable conditions. Required and non-empty when decision is conditional.',
      items: { type: 'string' },
    },
    scores: {
      type: 'object',
      additionalProperties: false,
      required: ['demand', 'feasibility', 'cost', 'risk'],
      properties: {
        demand: { type: 'integer', description: '1 (weak) to 5 (strong) real demand.' },
        feasibility: { type: 'integer', description: '1 (hard) to 5 (easy) to build.' },
        cost: { type: 'integer', description: '1 (cheap) to 5 (expensive).' },
        risk: { type: 'integer', description: '1 (safe) to 5 (risky).' },
      },
    },
    shortcomings: {
      type: 'array',
      description: 'At least two concrete shortcomings, ordered by severity.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'evidence', 'severity', 'verify'],
        properties: {
          claim: { type: 'string' },
          evidence: {
            type: 'string',
            description: 'A quoted transcript line, a file path, or a concrete fact with a number.',
          },
          severity: { type: 'string', enum: ['fatal', 'major', 'minor'] },
          verify: { type: 'string', description: 'The smallest action that would confirm or refute it.' },
        },
      },
    },
    disagreements: {
      type: 'array',
      description: 'Unresolved disputes. Required when the debaters still disagree.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'positions'],
        properties: {
          topic: { type: 'string' },
          positions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    nextStep: {
      type: 'string',
      description: 'The smallest next validation step.',
    },
    confidence: { type: 'number', description: '0 to 1.' },
  },
}
