import { expect, test } from 'claude-code/testing'

import { runBreaksCommand } from '../hooks/command'
import {
  addReminder,
  awayReset,
  chargeOf,
  doneLabelOf,
  dueIds,
  factCount,
  factOf,
  find,
  formatLeft,
  glyphFor,
  itemsOf,
  lookup,
  markDone,
  markFired,
  MAX_REMINDERS,
  messageFor,
  missingBuiltIns,
  normalize,
  parseNewReminder,
  pause,
  removeReminder,
  restoreBuiltIns,
  resume,
  setEvery,
  snooze,
  stepFor,
  toggle,
  useRecommended,
  whyOf,
} from '../hooks/reminders'
import { TEMPLATES } from '../hooks/templates'

const MIN = 60_000
const T0 = 1_000_000

// The tests time things against these intervals, which are not the ones the mod ships with, so
// they keep their meaning when a default changes. The defaults have tests of their own.
const fresh = (now = T0) =>
  (
    [
      ['water', 45],
      ['eyes', 30],
      ['stretch', 60],
      ['walk', 120],
    ] as const
  ).reduce((snap, [id, minutes]) => setEvery(snap, id, minutes, now), normalize(undefined, now))

const added = (snap: ReturnType<typeof normalize>, text: string, now = T0) => {
  const parsed = parseNewReminder(text)

  if (typeof parsed === 'string') {
    throw new Error(parsed)
  }

  const result = addReminder(snap, parsed, now)

  if (typeof result === 'string') {
    throw new Error(result)
  }

  return result
}

test('an empty store gets the built-in reminders at the recommended intervals, and Medicine ships switched off', async () => {
  const shipped = normalize(undefined, T0)
  expect(shipped.reminders.map(reminder => reminder.id)).toEqual(['water', 'eyes', 'stretch', 'walk', 'medicine'])
  // A glass an hour, the 20-20-20 rule, a micro-break every half hour, a short walk each hour.
  expect(shipped.reminders.map(reminder => reminder.everyMin)).toEqual([60, 20, 30, 60, 480])
  expect(find(shipped, 'water')).toMatchObject({ enabled: true, builtIn: true })
  expect(find(shipped, 'medicine')).toMatchObject({ enabled: false, emoji: '💊' })
  expect(shipped.clocks.walk).toEqual({ since: T0, firedFor: -1 })
  expect(shipped.seeded).toEqual(TEMPLATES.map(template => template.id))
  expect(shipped.settings).toEqual({ sound: true, awayMin: 20 })
  expect(shipped.pausedAt).toBeNull()
  // Switched off, it charges nothing and never comes due.
  expect(itemsOf(shipped, T0).map(item => item.reminder.id)).not.toContain('medicine')
  expect(dueIds(shipped, T0 + 5000 * MIN)).not.toContain('medicine')
})

test('the recommended intervals can be put back, leaving what is on or off and your own reminders alone', async () => {
  const changed = setEvery(toggle(added(normalize(undefined, T0), '🍎 Snack 90'), 'walk', T0), 'water', 25, T0)
  const back = useRecommended(changed, T0 + MIN)

  expect(back.changed).toEqual(['Water 60'])
  expect(find(back.snap, 'water')?.everyMin).toBe(60)
  expect(find(back.snap, 'walk')?.enabled).toBe(false)
  expect(find(back.snap, 'custom-snack')?.everyMin).toBe(90)
  expect(useRecommended(back.snap, T0 + 2 * MIN).changed).toEqual([])

  const old = useRecommended(fresh(), T0)
  expect(old.changed).toEqual(['Water 60', 'Eyes 20', 'Stretch 30', 'Walk 60'])
})

test('a store that is from the first version moves over, keeps its settings, and gains Medicine switched off', async () => {
  const old = {
    settings: { sound: false, awayMin: 30, reminders: { water: { enabled: false, everyMin: 50 }, eyes: { enabled: true, everyMin: 25 }, stretch: { enabled: true, everyMin: 60 }, walk: { enabled: true, everyMin: 120 } } },
    clocks: { water: { since: 5, firedFor: 5 }, eyes: { since: 7 } },
    pausedAt: null,
    lastActiveAt: 9,
  }
  const moved = normalize(old, T0)

  expect(moved.settings).toEqual({ sound: false, awayMin: 30 })
  expect(find(moved, 'water')).toMatchObject({ enabled: false, everyMin: 50 })
  expect(find(moved, 'eyes')?.everyMin).toBe(25)
  expect(moved.clocks.water).toEqual({ since: 5, firedFor: 5 })
  expect(moved.clocks.eyes).toEqual({ since: 7, firedFor: -1 })
  expect(find(moved, 'medicine')?.enabled).toBe(false)
  expect(moved.lastActiveAt).toBe(9)
  // Reading it again changes nothing.
  expect(normalize(moved, T0 + MIN)).toEqual(moved)
})

test('a store with odd values clamps them and drops what it cannot read', async () => {
  const odd = normalize(
    {
      settings: { awayMin: 9999 },
      reminders: [{ id: 'water', everyMin: 0, enabled: false }, { nonsense: true }, { id: 'water', everyMin: 99 }, { id: 'x', name: 'x'.repeat(80), color: 'red', everyMin: 9999 }],
      seeded: ['water', 'eyes', 'stretch', 'walk', 'medicine'],
    },
    T0,
  )

  expect(odd.settings.awayMin).toBe(120)
  expect(odd.reminders.map(reminder => reminder.id)).toEqual(['water', 'x'])
  expect(find(odd, 'water')).toMatchObject({ everyMin: 1, enabled: false })
  expect(find(odd, 'x')).toMatchObject({ everyMin: 480, builtIn: false, color: '#f2994a' })
  expect(find(odd, 'x')?.name).toHaveLength(24)
  expect(normalize('nonsense', T0).settings.sound).toBe(true)
})

test('a reminder charges to full, comes due once, and starts again when it is done', async () => {
  const snap = fresh()
  expect(dueIds(snap, T0 + 29 * MIN)).toEqual([])
  expect(chargeOf(30, snap.clocks.eyes!, T0 + 15 * MIN, null).fraction).toBe(0.5)

  expect(dueIds(snap, T0 + 30 * MIN)).toEqual(['eyes'])
  const fired = markFired(snap, ['eyes'])
  expect(dueIds(fired, T0 + 31 * MIN)).not.toContain('eyes')

  const done = markDone(fired, ['eyes'], T0 + 32 * MIN)
  expect(dueIds(done, T0 + 61 * MIN)).not.toContain('eyes')
  expect(dueIds(done, T0 + 62 * MIN)).toContain('eyes')
})

test('a reminder that is off charges nothing and shows nowhere; turning it on starts it fresh', async () => {
  const off = toggle(fresh(), 'walk', T0)
  expect(itemsOf(off, T0).map(item => item.reminder.id)).not.toContain('walk')
  expect(dueIds(off, T0 + 500 * MIN)).not.toContain('walk')

  const on = toggle(off, 'walk', T0 + 500 * MIN)
  expect(itemsOf(on, T0 + 500 * MIN).find(item => item.reminder.id === 'walk')?.charge.fraction).toBe(0)

  const medicine = toggle(fresh(), 'medicine', T0 + 10 * MIN)
  expect(dueIds(medicine, T0 + 489 * MIN)).not.toContain('medicine')
  expect(dueIds(medicine, T0 + 490 * MIN)).toContain('medicine')
})

test('pausing freezes every charge and resuming gives the time back', async () => {
  const paused = pause(fresh(), T0 + 10 * MIN)
  expect(dueIds(paused, T0 + 300 * MIN)).toEqual([])
  expect(chargeOf(30, paused.clocks.eyes!, T0 + 300 * MIN, paused.pausedAt).fraction).toBe(1 / 3)

  const back = resume(paused, T0 + 100 * MIN)
  expect(back.pausedAt).toBeNull()
  expect(dueIds(back, T0 + 119 * MIN)).not.toContain('eyes')
  expect(dueIds(back, T0 + 120 * MIN)).toContain('eyes')
})

test('a resume keeps a reminder that already announced from announcing again', async () => {
  const fired = markFired(fresh(), ['eyes'])
  const back = resume(pause(fired, T0 + 31 * MIN), T0 + 40 * MIN)

  expect(dueIds(back, T0 + 41 * MIN)).not.toContain('eyes')
})

test('a longer interval lets a reminder announce again; a shorter one that is already ready does not repeat', async () => {
  const fired = markFired(fresh(), ['eyes'])
  const longer = setEvery(fired, 'eyes', 60, T0 + 31 * MIN)
  expect(dueIds(longer, T0 + 59 * MIN)).not.toContain('eyes')
  expect(dueIds(longer, T0 + 60 * MIN)).toContain('eyes')

  const shorter = setEvery(fired, 'eyes', 10, T0 + 31 * MIN)
  expect(dueIds(shorter, T0 + 32 * MIN)).not.toContain('eyes')
  expect(find(setEvery(fired, 'eyes', 9999, T0), 'eyes')?.everyMin).toBe(480)
})

test('snooze makes a reminder ready again after the minutes given, whatever its interval', async () => {
  const ready = markFired(fresh(), ['water'])
  const later = snooze(ready, ['water'], 10, T0 + 50 * MIN)

  expect(dueIds(later, T0 + 59 * MIN)).not.toContain('water')
  expect(dueIds(later, T0 + 60 * MIN)).toContain('water')
})

test('a prompt after a long silence counts as the break for the reminders that want it, and a start after one resets all that are on', async () => {
  const snap = fresh()

  const soon = awayReset(snap, T0 + 10 * MIN, 'prompt')
  expect(soon.reset).toEqual([])
  expect(soon.snap.lastActiveAt).toBe(T0 + 10 * MIN)

  const away = awayReset(snap, T0 + 25 * MIN, 'prompt')
  expect([...away.reset].sort()).toEqual(['eyes', 'stretch', 'walk'])
  expect(away.snap.clocks.water?.since).toBe(T0)
  expect(away.snap.clocks.eyes?.since).toBe(T0 + 25 * MIN)

  const morning = awayReset(snap, T0 + 600 * MIN, 'startup')
  expect([...morning.reset].sort()).toEqual(['eyes', 'stretch', 'walk', 'water'])
  expect(dueIds(morning.snap, T0 + 600 * MIN)).toEqual([])

  const noWalk = awayReset(toggle(snap, 'walk', T0), T0 + 600 * MIN, 'startup')
  expect(noWalk.reset).not.toContain('walk')
})

test('a line typed to add a reminder is read as an emoji, a name, the minutes and a message', async () => {
  expect(parseNewReminder('🍎 Snack 90 | Time to eat something')).toEqual({ emoji: '🍎', name: 'Snack', everyMin: 90, message: 'Time to eat something' })
  expect(parseNewReminder('Take a deep breath 15')).toEqual({ emoji: '⏰', name: 'Take a deep breath', everyMin: 15 })
  expect(parseNewReminder('🌿 Plants')).toEqual({ emoji: '🌿', name: 'Plants', everyMin: 60 })
  expect(parseNewReminder('🍎 90')).toBe('Give it a name, for example: 🍎 Snack 90 | Time to eat something')
  expect(parseNewReminder('')).toContain('Give it a name')
  expect(parseNewReminder('🍎 Snack 9000')).toContain('between 1 and 480')
  expect(parseNewReminder(`${'long '.repeat(10)}30`)).toContain('24 characters')
})

test('a reminder you add charges from now, can be switched off and deleted, and a deleted built-in comes back on request', async () => {
  const snap = added(fresh(), '🍎 Snack 90 | Time to eat something', T0 + 5 * MIN)
  const snack = find(snap, 'custom-snack')

  expect(snack).toMatchObject({ name: 'Snack', emoji: '🍎', everyMin: 90, builtIn: false, enabled: true })
  expect(snap.clocks['custom-snack']).toEqual({ since: T0 + 5 * MIN, firedFor: -1 })
  expect(dueIds(snap, T0 + 94 * MIN)).not.toContain('custom-snack')
  expect(dueIds(snap, T0 + 95 * MIN)).toContain('custom-snack')
  expect(doneLabelOf(snack!)).toBe('Done')
  expect(messageFor(snack!, T0)).toBe('Time to eat something')
  expect(whyOf(snack!)).toBe('Time to eat something')
  expect(factOf(snack!, 0)).toBeUndefined()
  expect(factCount(snack!)).toBe(0)

  expect(addReminder(snap, { name: 'snack', emoji: '🍪', everyMin: 5 }, T0)).toContain('already a reminder called')
  expect(find(added(snap, '🥕 Snack time 20'), 'custom-snack-time')).toBeDefined()

  const gone = removeReminder(snap, 'custom-snack')
  expect(find(gone, 'custom-snack')).toBeUndefined()
  expect(gone.clocks['custom-snack']).toBeUndefined()
  expect(normalize(gone, T0).reminders.some(reminder => reminder.id === 'custom-snack')).toBe(false)

  const noWater = removeReminder(snap, 'water')
  expect(missingBuiltIns(noWater).map(template => template.id)).toEqual(['water'])
  // Gone stays gone when the store is read again.
  expect(find(normalize(noWater, T0), 'water')).toBeUndefined()
  const back = restoreBuiltIns(noWater, T0 + 60 * MIN)
  expect(find(back, 'water')).toMatchObject({ enabled: true, everyMin: 60 })
  expect(back.clocks.water).toEqual({ since: T0 + 60 * MIN, firedFor: -1 })
})

test('there is a limit on how many reminders there can be, and names are told apart without regard to case', async () => {
  let snap = fresh()

  for (let i = snap.reminders.length; i < MAX_REMINDERS; i += 1) {
    snap = added(snap, `🔔 Bell ${i} 30`)
  }

  expect(snap.reminders).toHaveLength(MAX_REMINDERS)
  expect(addReminder(snap, { name: 'One more', emoji: '🔔', everyMin: 30 }, T0)).toContain('the most reminders')
  expect(lookup(snap, 'WATER')?.id).toBe('water')
  expect(lookup(snap, 'wat')?.id).toBe('water')
  expect(lookup(snap, 'bell 5')?.id).toBe('custom-bell-5')
  expect(lookup(snap, 'zzz')).toBeUndefined()
})

test('every built-in reminder says why it matters and has facts; the medicine one only points to the label', async () => {
  for (const template of TEMPLATES) {
    expect(template.why.length).toBeGreaterThan(40)
    expect(template.facts.length).toBeGreaterThanOrEqual(4)
    expect(new Set(template.facts).size).toBe(template.facts.length)
    expect(template.facts.every(fact => fact.length > 20 && fact.length < 260)).toBe(true)
    expect(template.messages.length).toBeGreaterThanOrEqual(1)
  }

  const snap = fresh()
  const medicine = find(snap, 'medicine')!
  expect(whyOf(medicine)).toContain('not medical advice')
  expect(factOf(medicine, 1)).toContain('brushing your teeth')
  expect(factOf(medicine, 1 + factCount(medicine))).toBe(factOf(medicine, 1))
  expect(messageFor(find(snap, 'water')!, T0)).toContain('💧')
})

test('time left and the charge glyph read at a glance', async () => {
  expect(formatLeft(0)).toBe('ready')
  expect(formatLeft(30_000)).toBe('1m')
  expect(formatLeft(31 * MIN)).toBe('31m')
  expect(formatLeft(60 * MIN)).toBe('1h')
  expect(formatLeft(125 * MIN)).toBe('2h05')

  const charge = (fraction: number, isReady = false) => ({ fraction, leftMs: 0, isReady })
  expect([0, 0.3, 0.6, 0.9].map(f => glyphFor(charge(f)))).toEqual(['○', '◔', '◑', '◕'])
  expect(glyphFor(charge(1, true))).toBe('●')
  expect([stepFor(30), stepFor(60), stepFor(90)]).toEqual([5, 15, 15])
})

test('/breaks answers status, done, snooze, set, on and off, and a name it does not know', async () => {
  const snap = fresh()
  const at = T0 + 31 * MIN

  expect(runBreaksCommand('', snap, at).open).toBe(true)
  expect(runBreaksCommand('test', snap, at).test).toBe(true)
  expect(runBreaksCommand('status', snap, at).text).toContain('Medicine')
  expect(runBreaksCommand('status', snap, at).text).toContain('off')
  expect(runBreaksCommand('help', snap, at).text).toContain('/breaks add')

  const done = runBreaksCommand('done', snap, at)
  expect(done.text).toBe('Started again: eyes.')
  expect(done.snap?.clocks.eyes?.since).toBe(at)
  expect(runBreaksCommand('done', snap, T0 + MIN).text).toBe('Nothing is ready yet.')
  expect(runBreaksCommand('done all', snap, at).snap?.clocks.walk?.since).toBe(at)
  expect(runBreaksCommand('done tea', snap, at).text).toContain('No reminder called "tea"')

  expect(runBreaksCommand('snooze eyes 15', snap, at).text).toBe('Snoozed eyes for 15 min.')
  expect(find(runBreaksCommand('set wat 40', snap, at).snap!, 'water')?.everyMin).toBe(40)
  expect(runBreaksCommand('set water', snap, at).text).toContain('Usage')
  expect(find(runBreaksCommand('off walk', snap, at).snap!, 'walk')?.enabled).toBe(false)
  expect(runBreaksCommand('on walk', snap, at).text).toBe('Walk is already on.')
  expect(find(runBreaksCommand('on med', snap, at).snap!, 'medicine')?.enabled).toBe(true)
  expect(runBreaksCommand('sound off', snap, at).snap?.settings.sound).toBe(false)
  expect(runBreaksCommand('pause', snap, at).snap?.pausedAt).toBe(at)
  expect(runBreaksCommand('dance', snap, at).text).toContain('Unknown option')
})

test('/breaks adds your own reminder, deletes one, and restores the built-ins', async () => {
  const snap = fresh()

  const add = runBreaksCommand('add 🍎 Snack 90 | Time to eat something', snap, T0)
  expect(add.text).toBe('Added 🍎 Snack, every 90 min.')
  expect(find(add.snap!, 'custom-snack')?.message).toBe('Time to eat something')
  expect(runBreaksCommand('add', snap, T0).text).toContain('Give it a name')
  expect(runBreaksCommand('add 🍎 Water 10', snap, T0).text).toContain('already a reminder called')

  const del = runBreaksCommand('delete snack', add.snap!, T0)
  expect(del.text).toBe('Deleted Snack.')
  expect(find(del.snap!, 'custom-snack')).toBeUndefined()
  expect(runBreaksCommand('delete', snap, T0).text).toContain('Which one?')
  expect(runBreaksCommand('delete zzz', snap, T0).text).toContain('No reminder called "zzz"')

  const noWater = runBreaksCommand('remove water', snap, T0)
  expect(noWater.text).toBe('Deleted Water. /breaks restore brings it back.')
  expect(runBreaksCommand('restore', noWater.snap!, T0 + MIN).text).toBe('Restored: Water.')
  expect(runBreaksCommand('restore', snap, T0).text).toContain('Nothing to restore')
})

test('/breaks defaults sets the built-in reminders to the recommended intervals', async () => {
  const snap = fresh()
  const used = runBreaksCommand('defaults', snap, T0)

  expect(used.text).toBe('Recommended intervals set (minutes): Water 60, Eyes 20, Stretch 30, Walk 60.')
  expect(find(used.snap!, 'eyes')?.everyMin).toBe(20)
  expect(runBreaksCommand('defaults', used.snap!, T0).text).toContain('already at the recommended')
  expect(runBreaksCommand('help', snap, T0).text).toContain('/breaks defaults')
})
