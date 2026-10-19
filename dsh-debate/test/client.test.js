import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Load the browser module the way the Client loader does, then activate it with
 * a mocked Cordis context. This is the regression test for the boot failure:
 * activation must register both slots and must not throw when the locale
 * service is unavailable.
 */

const target = path.join(import.meta.dirname, '..', 'client.js')
let definition

globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      definition = def
    },
  },
}

await import(`${pathToFileURL(target).href}?test=${Date.now()}`)

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
}

function activate(locale) {
  assert.ok(definition, 'module loader received a definition')
  const factory = definition.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })
  const registrations = []
  const ctx = {
    locale,
    slots: {
      inject: (key, callback) => {
        registrations.push(['inject', key])
        return callback()
      },
      register: (options, component) => {
        registrations.push(['register', options.name, options.key ?? options.id, component])
        return () => {}
      },
    },
  }
  factory.apply(ctx)
  return { factory, registrations }
}

function collectTypes(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectTypes(child, out)
    return out
  }
  if (!node || typeof node !== 'object') return out
  out.push(node.type)
  for (const child of node.children ?? []) collectTypes(child, out)
  return out
}

test('activates both slots and renders the panel and icon', () => {
  const { factory, registrations } = activate({ getLocale: () => ({ active: 'zh-CN' }) })
  assert.deepEqual(factory.inject, ['slots'])

  const panel = registrations.find((row) => row[0] === 'register' && row[1] === 'main')
  const icon = registrations.find((row) => row[0] === 'register' && row[1] === 'sidebar.panellist')
  assert.equal(panel[2], 'debate')
  assert.equal(icon[2], 'debate')

  const panelTree = panel[3]()
  assert.equal(panelTree.type, 'div')
  const iconTree = icon[3]({ size: 20, active: true })
  assert.equal(iconTree.type, 'svg')
})

test('a missing locale service degrades instead of failing activation', () => {
  const { registrations } = activate({
    getLocale() {
      throw new Error('locale unavailable')
    },
  })
  assert.ok(registrations.some((row) => row[1] === 'main'))
})

test('renders the report markdown subset', () => {
  const { factory } = activate({ getLocale: () => ({ active: 'zh-CN' }) })
  const markdown = [
    '# 一级标题',
    '## 二级标题',
    '段落里的 **粗体** 与 `代码`。',
    '',
    '| 编号 | 结论 |',
    '|---|---|',
    '| d-1 | 有条件做 |',
    '',
    '- 第一条',
    '  - 嵌套项',
    '',
    '> 引用块',
    '',
    '---',
    '',
    '```json',
    '{"a":1}',
    '```',
  ].join('\n')
  const tree = factory.__test.renderMarkdown(markdown)
  const types = collectTypes(tree)
  for (const type of ['h1', 'h2', 'p', 'strong', 'code', 'table', 'ul', 'blockquote', 'hr', 'pre']) {
    assert.ok(types.includes(type), `expected <${type}> in ${types.join(',')}`)
  }
})

test('history detail opens on the rendered markdown report', () => {
  const { factory } = activate({ getLocale: () => ({ active: 'zh-CN' }) })
  const record = {
    id: 'd-1',
    title: '标题',
    createdAt: '2026-10-19T12:00:00.000Z',
    incomplete: false,
    verdict: {
      decision: 'go',
      summary: 'ok',
      conditions: [],
      scores: { demand: 4, feasibility: 4, cost: 3, risk: 2 },
      shortcomings: [],
      disagreements: [],
      nextStep: 'pilot',
      confidence: 0.6,
    },
    round1: {},
    round2: {},
    reportPath: 'E:/proj/.debate/x.md',
  }
  const tree = factory.__test.Detail({
    detail: { record, markdown: '# 报告标题\n\n正文段落', row: { title: '标题' } },
    onBack: () => {},
  })
  const types = collectTypes(tree)
  assert.ok(types.includes('h1'), 'report heading renders')
  assert.ok(JSON.stringify(tree).includes('报告标题'))
  assert.ok(JSON.stringify(tree).includes('报告'), 'report tab is present')
})
