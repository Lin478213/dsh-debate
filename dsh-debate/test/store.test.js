import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendIndex, indexPath, readIndex, saveDebate } from '../lib/store.js'

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'debate-test-'))
}

test('missing index reads as an empty history', async () => {
  const home = await tempDir()
  try {
    assert.deepEqual(await readIndex({ home }), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('saveDebate writes a report and an index row', async () => {
  const home = await tempDir()
  const cwd = await tempDir()
  try {
    const record = {
      id: 'd-1',
      title: '每日回顾',
      idea: '加一个每日回顾插件',
      createdAt: '2026-10-19T12:00:00.000Z',
      language: 'zh',
      incomplete: false,
      verdict: { decision: 'go', summary: '可以做。', conditions: [], scores: {}, shortcomings: [], disagreements: [], nextStep: '试点', confidence: 0.6 },
    }
    const { reportPath, recordPath } = await saveDebate(record, { cwd, home })
    assert.equal(path.dirname(reportPath), path.join(cwd, '.debate'))
    const text = await readFile(reportPath, 'utf8')
    assert.match(text, /结论：做/)

    const sidecar = JSON.parse(await readFile(recordPath, 'utf8'))
    assert.equal(sidecar.id, 'd-1')
    assert.equal(sidecar.verdict.decision, 'go')

    const rows = await readIndex({ home })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'd-1')
    assert.equal(rows[0].decision, 'go')
    assert.equal(rows[0].reportPath, reportPath)
    assert.equal(rows[0].recordPath, recordPath)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
  }
})

test('index rows come back newest first and corrupt lines are skipped', async () => {
  const home = await tempDir()
  try {
    const file = indexPath(home)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, [
      JSON.stringify({ id: 'old', createdAt: '2026-10-18T00:00:00.000Z' }),
      '{not json',
      JSON.stringify({ id: 'new', createdAt: '2026-10-19T00:00:00.000Z' }),
      '',
    ].join('\n'), 'utf8')
    const rows = await readIndex({ home })
    assert.deepEqual(rows.map((row) => row.id), ['new', 'old'])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('appendIndex creates the index directory', async () => {
  const home = await tempDir()
  try {
    await appendIndex({ id: 'x' }, home)
    const raw = await readFile(indexPath(home), 'utf8')
    assert.match(raw, /"id":"x"/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
