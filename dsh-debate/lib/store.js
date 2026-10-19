/**
 * Durable output for debates: the project-local report plus a cross-project
 * index the panel reads.
 *
 * The report follows the session's working directory (so it travels with the
 * repository); the index lives in the Harness home (so the panel can list
 * debates from every project). Nothing here throws on a missing index: an
 * absent index is an empty history.
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { renderReport, reportFileName } from './report.js'

/** Harness home; overridable for tests through `DSH_HOME`. */
export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function indexPath(home = dshHome()) {
  return path.join(home, 'debate', 'index.jsonl')
}

/** Append one index row, creating the directory on first use. */
export async function appendIndex(entry, home = dshHome()) {
  const file = indexPath(home)
  await mkdir(path.dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8')
  return file
}

/**
 * Read index rows newest first.
 * @param {{ home?: string, limit?: number }} [options]
 * @returns {Promise<object[]>} parsed rows, corrupt lines skipped
 */
export async function readIndex({ home = dshHome(), limit = 100 } = {}) {
  let raw
  try {
    raw = await readFile(indexPath(home), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const rows = []
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    try {
      const row = JSON.parse(text)
      if (row && typeof row.id === 'string') rows.push(row)
    } catch {
      // A torn line (crash mid-append) must not hide the rest of the history.
    }
  }
  return rows.reverse().slice(0, limit)
}

/** Write the report and append its index row. */
export async function saveDebate(record, { cwd, outputDir = '.debate', home = dshHome() } = {}) {
  const directory = path.join(cwd, outputDir)
  const fileName = reportFileName(record.createdAt ?? new Date(), record.idea ?? record.title ?? '')
  const reportPath = path.join(directory, fileName)
  const withPath = { ...record, reportPath }
  await mkdir(directory, { recursive: true })
  await writeFile(reportPath, renderReport(withPath, record.language ?? 'zh'), 'utf8')
  await appendIndex({
    id: record.id,
    sessionId: record.sessionId ?? null,
    cwd,
    title: record.title ?? fileName,
    decision: record.verdict?.decision ?? null,
    incomplete: record.incomplete === true,
    createdAt: record.createdAt,
    reportPath,
  }, home)
  return { reportPath, fileName }
}
