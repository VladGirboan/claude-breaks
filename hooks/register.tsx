import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Alert, Reminder, Snapshot } from '../types'
import { alertPane } from './alert'
import { bandRow } from './band'
import { runBreaksCommand } from './command'
import {
  addReminder,
  awayReset,
  dueIds,
  factCount,
  factOf,
  find,
  itemsOf,
  markDone,
  markFired,
  messageFor,
  normalize,
  parseNewReminder,
  pause,
  readyIds,
  removeReminder,
  restoreBuiltIns,
  resume,
  setAway,
  setEvery,
  setSound,
  snooze,
  toggle,
  whyOf,
} from './reminders'
import { settingsPane } from './settings'

const SETTINGS = 'breaks-settings'
const ALERT = 'breaks-alert'
// How often the cooldowns move and a due reminder is looked for.
const TICK_MS = 20_000
const TOAST_MS = 20_000
const CHIME = 'assets/chime.wav'

const snapAtom = atom({ plugin: 'breaks', key: 'snap' } as const, null as Snapshot | null)
const nowAtom = atom({ plugin: 'breaks', key: 'now' } as const, 0)
const alertAtom = atom({ plugin: 'breaks', key: 'alert' } as const, null as Alert | null)
const pendingAtom = atom({ plugin: 'breaks', key: 'pendingDelete' } as const, null as string | null)

// Everything lives under one key of `$.store`, which every session of the person shares:
// a Done pressed in one session shows in the others at their next tick.
const STORE_KEY = 'data'

let ticker: Timer | undefined
let isWorking = false

async function load($: EngineInterface, now: number): Promise<Snapshot> {
  return normalize(await $.store.get(STORE_KEY), now)
}

async function save($: EngineInterface, snap: Snapshot): Promise<void> {
  await $.store.set(STORE_KEY, snap)
}

// Stores a change and shows it, here and, at their next tick, in the other sessions.
async function commit($: EngineInterface, snap: Snapshot): Promise<void> {
  await save($, snap)
  await update($, snapAtom, () => snap)
}

// Reads the store again: another session may have changed it. Writes it down the first time,
// and whenever reading it filled something in (an older shape, a new built-in reminder).
async function refresh($: EngineInterface): Promise<{ snap: Snapshot; now: number }> {
  const now = await $.clock.now()
  const stored = await $.store.get(STORE_KEY)
  const snap = normalize(stored, now)

  if (JSON.stringify(stored) !== JSON.stringify(snap)) {
    await save($, snap)
  }

  await update($, snapAtom, () => snap)
  await update($, nowAtom, () => now)

  return { snap, now }
}

// The toast: where the pop-up cannot be shown (a terminal too narrow for a pane), it carries
// the whole of it.
function toastText(snap: Snapshot, alert: Alert): string {
  const first = alert.ids.map(id => find(snap, id)).find(reminder => reminder !== undefined)

  if (first === undefined) {
    return ''
  }

  const fact = factOf(first, alert.facts[first.id] ?? 0)
  const more = alert.ids.length > 1 ? `\n\n(and ${alert.ids.length - 1} more are ready)` : ''

  return `${messageFor(first, snap.clocks[first.id]?.since ?? 0)}\n\n${whyOf(first)}${fact === undefined ? '' : `\n\nDid you know? ${fact}`}${more}`
}

// A fun fact other than the one this reminder showed last time, when it has others.
function nextFact(count: number, last: number | undefined): number {
  if (count <= 1) {
    return 0
  }

  return last === undefined ? Math.floor(Math.random() * count) : (last + 1 + Math.floor(Math.random() * (count - 1))) % count
}

// The pop-up: a pane with the card, and where there is no room for a pane, a long toast.
async function announce($: EngineInterface, snap: Snapshot, ids: readonly string[], isPreview: boolean): Promise<void> {
  const reminders = ids.map(id => find(snap, id)).filter((reminder): reminder is Reminder => reminder !== undefined)

  if (reminders.length === 0) {
    return
  }

  const before = await read($, alertAtom)
  const facts = { ...(before?.facts ?? {}) }

  for (const reminder of reminders) {
    facts[reminder.id] = nextFact(factCount(reminder), facts[reminder.id])
  }

  const alert: Alert = {
    ids: [...new Set([...(before?.ids ?? []), ...reminders.map(reminder => reminder.id)])],
    facts,
    ...(isPreview ? { preview: true } : {}),
  }

  await update($, alertAtom, () => alert)

  // Asked for the keyboard: the surface grants it only over an empty prompt, so it never
  // takes keys from a message being typed.
  const opened = await $.ui.open({ id: ALERT, title: 'Break time', focus: true, closeOnEscape: true, rows: 18 })

  if (!opened.isPlaced) {
    $.ui.toast(toastText(snap, alert), { timeoutMs: TOAST_MS })
  }

  if (snap.settings.sound) {
    // Plays where the host has a player; elsewhere it rejects, and the pop-up is enough.
    await $.audio.play({ asset: CHIME }).catch(() => undefined)
  }
}

// One pop-up for everything that came due, once per cycle. Held while Claude works, so it
// never lands in the middle of a reply.
async function fireDue($: EngineInterface, snap: Snapshot, now: number): Promise<void> {
  const due = dueIds(snap, now)

  if (due.length === 0) {
    return
  }

  // Marked before the pop-up: a second session reading the store a moment later skips them.
  await commit($, markFired(snap, due))
  await announce($, snap, due, false)
}

async function tick($: EngineInterface): Promise<void> {
  const { snap, now } = await refresh($)

  if (!isWorking) {
    await fireDue($, snap, now)
  }
}

// The session starts with the cooldowns where they were left. After a long gap, a morning say,
// everything starts fresh instead of arriving as a pile of pop-ups.
async function start($: EngineInterface): Promise<void> {
  const { snap, now } = await refresh($)
  const away = awayReset(snap, now, 'startup')

  await commit($, away.snap)
  ticker?.cancel()
  ticker = $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

// Acts on the store as it is now, not on what was drawn: a press may be of a stale frame.
async function change($: EngineInterface, make: (snap: Snapshot, now: number) => Snapshot): Promise<void> {
  const { snap, now } = await refresh($)

  await commit($, make(snap, now))
}

// Takes finished reminders off the pop-up, and closes it once nothing is left on it.
async function settle($: EngineInterface, ids: readonly string[]): Promise<void> {
  const alert = await read($, alertAtom)

  if (alert === null) {
    return
  }

  const left = alert.ids.filter(id => !ids.includes(id))

  await update($, alertAtom, () => ({ ...alert, ids: left }))

  if (left.length === 0) {
    await $.ui.close({ id: ALERT })
  }
}

async function finish($: EngineInterface, make: (snap: Snapshot, now: number) => Snapshot, ids: readonly string[]): Promise<void> {
  await change($, make)
  await settle($, ids)
}

async function dismiss($: EngineInterface): Promise<void> {
  await update($, alertAtom, () => null)
  await $.ui.close({ id: ALERT })
}

async function addFromText($: EngineInterface, input: string): Promise<void> {
  const parsed = parseNewReminder(input)

  if (typeof parsed === 'string') {
    $.ui.toast(parsed)

    return
  }

  const { snap, now } = await refresh($)
  const added = addReminder(snap, parsed, now)

  if (typeof added === 'string') {
    $.ui.toast(added)

    return
  }

  await commit($, added)
  $.ui.toast(`Added ${parsed.emoji} ${parsed.name}, every ${parsed.everyMin} min.`, { timeoutMs: 5000 })
}

async function removeOne($: EngineInterface, id: string): Promise<void> {
  await change($, current => removeReminder(current, id))
  await update($, pendingAtom, () => null)
  await settle($, [id])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'breaks',
      description: 'Cooldown reminders: water, eyes, stretch, walk, medicine and your own. /breaks opens the settings',
      argumentHint: '[status | done | snooze | pause | resume | on | off | set | add | delete | restore | defaults | sound on|off | test]',
    })
    await start($)

    return next(e)
  })

  // /clear, /resume and /branch reset $.state to its defaults and skip session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      isWorking = false
      const { snap, now } = await refresh($)
      await fireDue($, snap, now)
    }

    return result
  })

  // A prompt after a long silence means the person stepped away: that counts as the break.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') {
      const { snap, now } = await refresh($)
      const away = awayReset(snap, now, 'prompt')

      await commit($, away.snap)

      if (away.reset.length > 0) {
        const emoji = away.reset.map(id => find(snap, id)?.emoji ?? '').join(' ')
        $.ui.toast(`Welcome back. Your time away counted as a break: ${emoji}`, { timeoutMs: 6000 })
      }
    }

    return next(e)
  })

  on('command.run', { command: 'breaks' }, async ($, e) => {
    const { snap, now } = await refresh($)
    const outcome = runBreaksCommand(e.args, snap, now)

    if (outcome.snap !== undefined) {
      await commit($, outcome.snap)
    }

    if (outcome.open === true) {
      await $.ui.open({ id: SETTINGS, title: 'Breaks', focus: true, closeOnEscape: true })

      return {}
    }

    if (outcome.test === true) {
      const sample = readyIds(snap, now)[0] ?? itemsOf(snap, now)[0]?.reminder.id ?? snap.reminders[0]?.id

      if (sample === undefined) {
        return { text: 'There are no reminders yet. Add one with /breaks add.' }
      }

      await announce($, snap, [sample], true)

      return {}
    }

    return { text: outcome.text ?? '' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapAtom)
    // Reading `now` is what redraws the band on each tick.
    const now = await read($, nowAtom)

    if (snap === null || now === 0 || e.props.hasSurvey) {
      return next(e)
    }

    const items = itemsOf(snap, now)

    if (items.length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box } = ui
    const theirs = await next(e)

    // Another mod's drawing here keeps its place, beneath this row.
    return (
      <Box flexDirection="column">
        {bandRow(
          ui,
          items,
          snap.pausedAt !== null,
          {
            done: id => void finish($, (current, at) => markDone(current, [id], at), [id]),
            resume: () => void change($, (current, at) => resume(current, at)),
            open: () => void $.ui.open({ id: SETTINGS, title: 'Breaks', focus: true, closeOnEscape: true }),
          },
          e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined,
        )}
        {theirs}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: ALERT }, async ($, e) => {
    const snap = await read($, snapAtom)
    const now = await read($, nowAtom)
    const alert = await read($, alertAtom)
    const ui = $.ui.resolve(e)

    if (snap === null) {
      return <ui.Text>Nothing to show yet.</ui.Text>
    }

    // Only what is still ready: one handled elsewhere drops off by itself.
    const ready = new Set(readyIds(snap, now))
    const entries = (alert?.ids ?? [])
      .map(id => find(snap, id))
      .filter((reminder): reminder is Reminder => reminder !== undefined && (alert?.preview === true || ready.has(reminder.id)))
      .map(reminder => ({ reminder, fact: factOf(reminder, alert?.facts[reminder.id] ?? 0) }))

    return alertPane(
      ui,
      entries,
      {
        done: id => void finish($, (current, at) => markDone(current, [id], at), [id]),
        snooze: id => void finish($, (current, at) => snooze(current, [id], 10, at), [id]),
        dismiss: () => void dismiss($),
      },
      e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined,
    )
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const snap = await read($, snapAtom)
    const now = await read($, nowAtom)
    const pending = await read($, pendingAtom)
    const ui = $.ui.resolve(e)

    if (snap === null || !('Input' in ui)) {
      return <ui.Text>Open the breaks settings in the terminal or the desktop app.</ui.Text>
    }

    return settingsPane(ui, snap, now, pending, {
      toggle: id => void change($, (current, at) => toggle(current, id, at)),
      every: (id, minutes) => void change($, (current, at) => setEvery(current, id, minutes, at)),
      done: id => void finish($, (current, at) => markDone(current, [id], at), [id]),
      snooze: id => void finish($, (current, at) => snooze(current, [id], 10, at), [id]),
      askDelete: id => void update($, pendingAtom, () => id),
      remove: id => void removeOne($, id),
      add: input => void addFromText($, input),
      restore: () => void change($, (current, at) => restoreBuiltIns(current, at)),
      sound: () => void change($, current => setSound(current, !current.settings.sound)),
      away: minutes => void change($, current => setAway(current, minutes)),
      pause: () => void change($, (current, at) => (current.pausedAt === null ? pause(current, at) : resume(current, at))),
    })
  })
}
