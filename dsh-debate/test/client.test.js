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
