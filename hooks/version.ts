import type { Snapshot, UpdateState } from '../types'

// Which version this is, where to look for a newer one, and how a version is read and compared.
// Pure: the web request itself is made in register.tsx, because only that file may use the engine.

// Keep in step with `version` in .claude-plugin/plugin.json (a test checks it).
export const VERSION = '0.1.0'

export const REPO = 'VladGirboan/claude-breaks'
export const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`

// A week between looks.
export const UPDATE_EVERY_MS = 7 * 24 * 60 * 60 * 1000

// The first x.y.z in what came back. The page is read by a model, so only digits are trusted.
export function parseVersion(text: string | undefined): string | undefined {
  return /\b(\d{1,4}\.\d{1,4}\.\d{1,4})\b/.exec(text ?? '')?.[1]
}

const parts = (version: string): number[] => version.split('.').map(Number)

export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate)
  const b = parts(current)

  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return (a[i] ?? 0) > (b[i] ?? 0)
    }
  }

  return false
}

// The newer version this person has not been told about yet, if any.
export const unannounced = (update: UpdateState, current: string = VERSION): string | undefined =>
  update.latest !== '' && isNewer(update.latest, current) && update.toldAbout !== update.latest ? update.latest : undefined

// The newest version known, when it is newer than this one.
export const newerThan = (update: UpdateState, current: string = VERSION): string | undefined =>
  update.latest !== '' && isNewer(update.latest, current) ? update.latest : undefined

export const isCheckDue = (update: UpdateState, now: number): boolean => update.check && now - update.checkedAt >= UPDATE_EVERY_MS

// What a look found: `latest` is undefined when the page could not be read.
export function recordCheck(snap: Snapshot, now: number, latest: string | undefined): Snapshot {
  return { ...snap, update: { ...snap.update, checkedAt: now, latest: latest ?? snap.update.latest } }
}

export const markTold = (snap: Snapshot): Snapshot => ({ ...snap, update: { ...snap.update, toldAbout: snap.update.latest } })

// How to get it, for each way the mod gets installed.
export const UPDATE_HOW = [
  'To update: run /plugin marketplace update breaks-marketplace, then /reload-plugins.',
  `If you cloned it and run it with --plugin-dir, run git pull in that folder instead. https://github.com/${REPO}`,
].join('\n')
