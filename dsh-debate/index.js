/**
 * Host half of the Debate Stage bundle.
 *
 * Registers the `debate` tool and the `/debate` command, keeps debate children
 * read-only through a tool guard, and persists every finished debate as a
 * project-local markdown report plus a cross-project index row.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { runDebate } from './lib/engine.js'
import { renderSummary } from './lib/report.js'
import { DEFAULT_DEBATERS, DEFAULT_JUDGE, roleLabel } from './lib/roles.js'
import { saveDebate, readIndex } from './lib/store.js'
import { MAX_IDEA_LENGTH } from './lib/verdict.js'

export const inject = ['tools', 'commands', 'subagents', 'workingDirectory']

const ALLOWED_CHILD_TOOLS = new Set(['read', 'grep', 'glob', 'structured_output'])

const DEFAULTS = {
  rounds: 2,
  timeLimitMs: 120_000,
  softStopMs: 100_000,
  language: 'zh',
  contextMode: 'auto',
  outputDir: '.debate',
  maxContextPaths: 12,
}

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['debateId', 'decision', 'incomplete', 'reportPath', 'summary', 'durationMs'],
  properties: {
    debateId: { type: 'string' },
    decision: { type: 'string', enum: ['go', 'conditional', 'no-go', 'none'] },
    incomplete: { type: 'boolean' },
    reportPath: { type: 'string' },
    summary: { type: 'string' },
    durationMs: { type: 'number' },
  },
}

function normalizeConfig(config = {}) {
  const language = config.language === 'en' ? 'en' : 'zh'
  const contextMode = ['auto', 'on', 'off'].includes(config.contextMode) ? config.contextMode : DEFAULTS.contextMode
  const outputDir = typeof config.outputDir === 'string'
    && config.outputDir.trim().length > 0
    && !path.isAbsolute(config.outputDir.replace(/\\/g, '/'))
    && !config.outputDir.replace(/\\/g, '/').split('/').includes('..')
    ? config.outputDir
    : DEFAULTS.outputDir
  return {
    rounds: Number.isInteger(config.rounds) ? config.rounds : DEFAULTS.rounds,
    timeLimitMs: Number.isFinite(config.timeLimitMs) ? config.timeLimitMs : DEFAULTS.timeLimitMs,
    softStopMs: Number.isFinite(config.softStopMs) ? config.softStopMs : DEFAULTS.softStopMs,
    language,
    contextMode,
    outputDir,
    maxContextPaths: Number.isInteger(config.maxContextPaths) ? config.maxContextPaths : DEFAULTS.maxContextPaths,
    debaters: resolveDebaters(config.roles),
    judge: resolveJudge(config.judge),
  }
}

function resolveDebaters(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return DEFAULT_DEBATERS
  return roles
    .filter((role) => role && typeof role.id === 'string' && role.id.length > 0)
    .map((role) => ({
      id: role.id,
      label: role.label ?? { zh: role.id, en: role.id },
      brief: role.brief ?? { zh: '', en: '' },
      ...(typeof role.provider === 'string' && typeof role.model === 'string'
        ? { provider: role.provider, model: role.model }
        : {}),
    }))
}

function resolveJudge(judge) {
  if (!judge || typeof judge !== 'object') return DEFAULT_JUDGE
  return {
    ...DEFAULT_JUDGE,
    ...(typeof judge.provider === 'string' && typeof judge.model === 'string'
      ? { provider: judge.provider, model: judge.model }
      : {}),
  }
}

function titleOf(idea) {
  return String(idea ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || '未命名辩题'
}

async function assertContextPaths(contextPaths, cwd) {
  const resolved = []
  for (const entry of contextPaths) {
    const text = String(entry ?? '').trim()
    if (!text) continue
    const absolute = path.resolve(cwd, text)
    try {
      await stat(absolute)
    } catch {
      throw new Error(`context path not found: ${text}`)
    }
    resolved.push(path.relative(cwd, absolute) || '.')
  }
  return resolved
}

export function apply(ctx, config = {}) {
  const options = normalizeConfig(config)
  const childTools = new Map()
  const running = new Map()
  const snapshots = new Map()

  ctx.effect(() => ctx.tools.guard((exec) => {
    if (exec.name === 'structured_output') return undefined
    const agent = exec.agent
    if (!agent) return undefined
    const child = childTools.get(String(agent.id))
    if (child === undefined) return undefined
    if (!child.tools) return `debate child may not use tools: ${exec.name}`
    if (!ALLOWED_CHILD_TOOLS.has(exec.name)) return `debate child is read-only: ${exec.name} is not allowed`
    return undefined
  }))

  const cwdOf = async (agent, signal) => {
    try {
      return await ctx.workingDirectory.ensure(agent, signal)
    } catch {
      return process.cwd()
    }
  }

  const executeDebate = async ({ agent, idea, contextPaths = [], signal }) => {
    const text = String(idea ?? '').trim()
    if (!text) throw new Error('idea is required')
    if (text.length > MAX_IDEA_LENGTH) throw new Error(`idea is too long (max ${MAX_IDEA_LENGTH} characters)`)

    const sessionKey = String(agent.id)
    if (running.has(sessionKey)) {
      throw new Error(`this session already has a debate running (${running.get(sessionKey)})`)
    }

    const cwd = await cwdOf(agent, signal)
    let paths = Array.isArray(contextPaths) ? contextPaths : [contextPaths]
    if (options.contextMode === 'off') paths = []
    if (options.contextMode === 'on' && paths.length === 0) paths = ['.']
    paths = (await assertContextPaths(paths.slice(0, options.maxContextPaths), cwd))

    running.set(sessionKey, 'starting')
    try {
      const record = await runDebate({
        subagents: ctx.subagents,
        parent: agent,
        idea: text,
        contextPaths: paths,
        cwd,
        language: options.language,
        rounds: options.rounds,
        timeLimitMs: options.timeLimitMs,
        softStopMs: options.softStopMs,
        debaters: options.debaters,
        judge: options.judge,
        sessionId: sessionKey,
        signal,
        trackChild: (childId, info) => childTools.set(String(childId), info ?? { tools: false }),
        untrackChild: (childId) => childTools.delete(String(childId)),
        onUpdate: (snapshot) => {
          running.set(sessionKey, snapshot.id)
          snapshots.set(sessionKey, {
            ...snapshot,
            title: titleOf(text),
            idea: text,
            sessionId: sessionKey,
            updatedAt: Date.now(),
          })
        },
      })

      snapshots.set(sessionKey, {
        id: record.id,
        phase: 'done',
        round1: record.round1,
        round2: record.round2,
        verdict: record.verdict,
        incomplete: record.incomplete,
        updatedAt: Date.now(),
      })

      try {
        const saved = await saveDebate(record, { cwd, outputDir: options.outputDir })
        record.reportPath = saved.reportPath
        record.recordPath = saved.recordPath
      } catch (error) {
        ctx.logger?.warn?.(`debate: failed to write report: ${String(error)}`)
        record.reportPath = ''
        record.recordPath = ''
        record.incompleteReasons.push(`报告写入失败：${error?.message ?? String(error)}`)
        record.incomplete = true
      }

      if (record.verdict && !record.verdict.summary) {
        record.verdict.summary = record.verdictRaw?.summary ?? ''
      }
      return record
    } finally {
      running.delete(sessionKey)
    }
  }

  ctx.effect(() => ctx.tools.register({
    name: 'debate',
    description: 'Run a structured cross-examination of one idea with three independent subagents (advocacy, value skepticism, engineering feasibility) and an independent judge. Use it when the user asks whether an idea is worth doing, asks for its weaknesses, or wants a decision reviewed before committing. It returns a verdict (go / conditional / no-go), a scored risk list backed by the transcript, and a markdown report. Takes up to two minutes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['idea'],
      properties: {
        idea: {
          type: 'string',
          description: `The idea to examine, one paragraph at most. Maximum ${MAX_IDEA_LENGTH} characters.`,
        },
        context: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional files or directories the debaters may inspect read-only (for example "src/auth" or "docs/plan.md").',
        },
      },
    },
    output: {
      schema: TOOL_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    timeoutMs: 150_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('debate tool requires a calling agent')
      const record = await executeDebate({
        agent: exec.agent,
        idea: args?.idea,
        contextPaths: Array.isArray(args?.context) ? args.context : [],
        signal: exec.signal,
      })
      return {
        debateId: record.id,
        decision: record.verdict?.decision ?? 'none',
        incomplete: record.incomplete,
        reportPath: record.reportPath ?? '',
        summary: renderSummary(record, options.language),
        durationMs: record.durationMs,
      }
    },
  }))

  ctx.effect(() => ctx.commands.register({
    name: 'debate',
    description: '让多名 agent 就一个想法交叉质询，产出可行性裁定与不足清单。',
    input: { hint: '<想法>（可用 @ 引用文件）' },
    async handler(invocation) {
      const raw = String(invocation.rawInput ?? '').trim()
      if (!raw) return { kind: 'error', text: '用法：/debate <想法>' }
      const record = await executeDebate({
        agent: invocation.agent,
        idea: raw,
        contextPaths: [],
        signal: invocation.signal,
      })
      return { kind: 'success', text: renderSummary(record, options.language) }
    },
  }))

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-debate/api/state',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const id = url.searchParams.get('id')
          if (id) {
            const rows = await readIndex({ limit: 500 })
            const row = rows.find((candidate) => candidate.id === id)
            if (!row) {
              sendJson(res, 404, { error: 'debate not found' })
              return
            }
            let record = null
            if (row.recordPath) {
              try {
                record = JSON.parse(await readFile(row.recordPath, 'utf8'))
              } catch {
                record = null
              }
            }
            let markdown = ''
            if (row.reportPath) {
              try {
                markdown = await readFile(row.reportPath, 'utf8')
              } catch {
                markdown = ''
              }
            }
            sendJson(res, 200, { row, record, markdown })
            return
          }
          const history = await readIndex({ limit: 50 })
          const cutoff = Date.now() - 10 * 60 * 1000
          const live = [...snapshots.values()].filter(
            (snapshot) => snapshot.phase !== 'done' || (snapshot.updatedAt ?? 0) > cutoff,
          )
          sendJson(res, 200, {
            live,
            history,
            roles: [
              ...options.debaters.map((role) => ({ id: role.id, label: roleLabel(role, options.language) })),
              { id: options.judge.id, label: roleLabel(options.judge, options.language) },
            ],
            language: options.language,
            now: Date.now(),
          })
        } catch (error) {
          sendJson(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }))
  })
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}
