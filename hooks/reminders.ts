import type { Clock, Reminder, Snapshot, UpdateState } from '../types'
import { CUSTOM_COLORS, TEMPLATES, templateOf } from './templates'
import type { Template } from './templates'

// The reminders, the rules that charge them, and the changes a person can make. Pure: no
// engine calls, so everything here is tested without a session.

export const MIN_EVERY = 1
export const MAX_EVERY = 480
export const DEFAULT_AWAY_MIN = 20
export const MIN_AWAY = 5
export const MAX_AWAY = 120
export const MAX_REMINDERS = 12
export const MAX_NAME = 24

const MINUTE = 60_000

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() !== '' ? value : fallback)

const everyOf = (value: unknown, fallback: number): number => clamp(Math.round(num(value, fallback)), MIN_EVERY, MAX_EVERY)

const fromTemplate = (template: Template): Reminder => ({
  id: template.id,
  name: template.name,
  emoji: template.emoji,
  color: template.color,
  everyMin: template.defaultEveryMin,
  enabled: template.defaultEnabled,
  resetOnAway: template.resetOnAway,
  builtIn: true,
})

// A built-in reminder saved under a name it used to have takes its current one; a name the
// person typed themselves stays.
const renamed = (template: Template | undefined, saved: string): string =>
  template?.formerNames?.includes(saved) === true ? template.name : saved

// One saved reminder, checked again: the store may hold an older or a broken shape.
function parseReminder(raw: unknown): Reminder | undefined {
  const saved = record(raw)
  const id = text(saved.id, '')

  if (id === '') {
    return undefined
  }

  const template = templateOf(id)
  const base = template === undefined ? undefined : fromTemplate(template)

  return {
    id,
    name: renamed(template, text(saved.name, base?.name ?? id)).slice(0, MAX_NAME),
    emoji: text(saved.emoji, base?.emoji ?? '⏰'),
    color: /^#[0-9a-fA-F]{6}$/.test(String(saved.color)) ? String(saved.color) : (base?.color ?? CUSTOM_COLORS[0] ?? '#f2994a'),
    everyMin: everyOf(saved.everyMin, base?.everyMin ?? 60),
    enabled: saved.enabled !== false,
    resetOnAway: saved.resetOnAway === true,
    builtIn: template !== undefined && saved.builtIn !== false,
    ...(typeof saved.message === 'string' && saved.message.trim() !== '' ? { message: saved.message } : {}),
  }
}

// The first version kept its four reminders in a record keyed by id, in `settings`.
function migrate(settings: Record<string, unknown>): { reminders: Reminder[]; seeded: string[] } {
  const old = record(settings.reminders)
  const reminders = TEMPLATES.filter(template => template.id in old).map(template => ({
    ...fromTemplate(template),
    enabled: record(old[template.id]).enabled !== false,
    everyMin: everyOf(record(old[template.id]).everyMin, template.defaultEveryMin),
  }))

  return { reminders, seeded: reminders.map(reminder => reminder.id) }
}

// What the store holds, checked again: it may be empty, or an older shape. Anything missing
// takes its default, a reminder with no clock yet starts charging at `now`, and a built-in
// reminder this person has not been given yet is added.
export function normalize(raw: unknown, now: number): Snapshot {
  const saved = record(raw)
  const settings = record(saved.settings)
  const hasList = Array.isArray(saved.reminders)

  const kept = hasList
    ? (saved.reminders as unknown[]).map(parseReminder).filter((reminder): reminder is Reminder => reminder !== undefined)
    : []
  const migrated = hasList ? { reminders: kept, seeded: [] as string[] } : migrate(settings)
  const seeded = hasList && Array.isArray(saved.seeded) ? (saved.seeded as unknown[]).filter((id): id is string => typeof id === 'string') : migrated.seeded

  const reminders = [...migrated.reminders]
  // Duplicate ids would share a clock: the later one goes.
  const unique = reminders.filter((reminder, i) => reminders.findIndex(other => other.id === reminder.id) === i)
  const given = new Set(seeded)

  for (const template of TEMPLATES) {
    if (!given.has(template.id)) {
      given.add(template.id)

      if (!unique.some(reminder => reminder.id === template.id)) {
        unique.push(fromTemplate(template))
      }
    }
  }

  const clocks = record(saved.clocks)

  return {
    settings: {
      sound: settings.sound !== false,
      awayMin: clamp(Math.round(num(settings.awayMin, DEFAULT_AWAY_MIN)), MIN_AWAY, MAX_AWAY),
    },
    reminders: unique.slice(0, MAX_REMINDERS),
    clocks: Object.fromEntries(
      unique.slice(0, MAX_REMINDERS).map(reminder => [
        reminder.id,
        { since: num(record(clocks[reminder.id]).since, now), firedFor: num(record(clocks[reminder.id]).firedFor, -1) },
      ]),
    ),
    seeded: [...given],
    pausedAt: typeof saved.pausedAt === 'number' ? saved.pausedAt : null,
    lastActiveAt: num(saved.lastActiveAt, now),
    update: parseUpdate(saved.update),
  }
}

function parseUpdate(raw: unknown): UpdateState {
  const saved = record(raw)

  return {
    check: saved.check === true,
    checkedAt: num(saved.checkedAt, 0),
    latest: text(saved.latest, ''),
    toldAbout: text(saved.toldAbout, ''),
  }
}

const clockOf = (snap: Snapshot, id: string): Clock => snap.clocks[id] ?? { since: 0, firedFor: -1 }

export const find = (snap: Snapshot, id: string): Reminder | undefined => snap.reminders.find(reminder => reminder.id === id)

// A name as typed: the id, or the start of the name, in any case.
export function lookup(snap: Snapshot, word: string | undefined): Reminder | undefined {
  const typed = (word ?? '').toLowerCase()

  return typed === ''
    ? undefined
    : (snap.reminders.find(reminder => reminder.id === typed || reminder.name.toLowerCase() === typed) ??
        snap.reminders.find(reminder => reminder.id.startsWith(typed) || reminder.name.toLowerCase().startsWith(typed)))
}

export const doneLabelOf = (reminder: Reminder): string => (reminder.builtIn ? (templateOf(reminder.id)?.doneLabel ?? 'Done') : 'Done')

export type Charge = {
  // 0 to 1, how full it is.
  fraction: number
  leftMs: number
  isReady: boolean
}

// A paused snapshot is frozen at the moment it was paused.
export function chargeOf(everyMin: number, clock: Clock, now: number, pausedAt: number | null): Charge {
  const every = everyMin * MINUTE
  const elapsed = Math.max(0, (pausedAt ?? now) - clock.since)

  return { fraction: Math.min(1, elapsed / every), leftMs: Math.max(0, every - elapsed), isReady: elapsed >= every }
}

export type Item = { reminder: Reminder; charge: Charge }

// The enabled reminders, in order, with their charge.
export const itemsOf = (snap: Snapshot, now: number): Item[] =>
  snap.reminders
    .filter(reminder => reminder.enabled)
    .map(reminder => ({ reminder, charge: chargeOf(reminder.everyMin, clockOf(snap, reminder.id), now, snap.pausedAt) }))

// Ready and not yet announced for this cycle; nothing is due while paused.
export function dueIds(snap: Snapshot, now: number): string[] {
  if (snap.pausedAt !== null) {
    return []
  }

  return itemsOf(snap, now)
    .filter(item => item.charge.isReady && clockOf(snap, item.reminder.id).firedFor !== clockOf(snap, item.reminder.id).since)
    .map(item => item.reminder.id)
}

// The reminders that are ready now, whether or not they were announced.
export const readyIds = (snap: Snapshot, now: number): string[] =>
  itemsOf(snap, now)
    .filter(item => item.charge.isReady)
    .map(item => item.reminder.id)

const withClocks = (snap: Snapshot, ids: readonly string[], make: (clock: Clock, reminder: Reminder) => Clock): Snapshot => ({
  ...snap,
  clocks: {
    ...snap.clocks,
    ...Object.fromEntries(
      ids.flatMap(id => {
        const reminder = find(snap, id)

        return reminder === undefined ? [] : [[id, make(clockOf(snap, id), reminder)]]
      }),
    ),
  },
})

export const markFired = (snap: Snapshot, ids: readonly string[]): Snapshot =>
  withClocks(snap, ids, clock => ({ ...clock, firedFor: clock.since }))

// Done: the charge starts again from empty.
export const markDone = (snap: Snapshot, ids: readonly string[], now: number): Snapshot =>
  withClocks(snap, ids, () => ({ since: now, firedFor: -1 }))

// Snooze: the reminder is ready again in `minutes`, whatever its interval.
export const snooze = (snap: Snapshot, ids: readonly string[], minutes: number, now: number): Snapshot =>
  withClocks(snap, ids, (_clock, reminder) => ({ since: now - (reminder.everyMin - minutes) * MINUTE, firedFor: -1 }))

export function pause(snap: Snapshot, now: number): Snapshot {
  return snap.pausedAt === null ? { ...snap, pausedAt: now } : snap
}

// Resuming moves every charge on by the time spent paused, so none is lost or gained.
export function resume(snap: Snapshot, now: number): Snapshot {
  if (snap.pausedAt === null) {
    return snap
  }

  const gap = Math.max(0, now - snap.pausedAt)

  return {
    ...snap,
    pausedAt: null,
    clocks: Object.fromEntries(
      Object.entries(snap.clocks).map(([id, clock]) => [
        id,
        { since: clock.since + gap, firedFor: clock.firedFor === clock.since ? clock.since + gap : clock.firedFor },
      ]),
    ),
  }
}

const withReminder = (snap: Snapshot, id: string, change: Partial<Reminder>): Snapshot => ({
  ...snap,
  reminders: snap.reminders.map(reminder => (reminder.id === id ? { ...reminder, ...change } : reminder)),
})

// A new interval. A reminder that stops being ready under it may announce again when it is.
export function setEvery(snap: Snapshot, id: string, minutes: number, now: number): Snapshot {
  const everyMin = clamp(Math.round(minutes), MIN_EVERY, MAX_EVERY)
  const changed = withReminder(snap, id, { everyMin })

  return chargeOf(everyMin, clockOf(snap, id), now, snap.pausedAt).isReady
    ? changed
    : withClocks(changed, [id], clock => ({ ...clock, firedFor: -1 }))
}

// The step the + and - buttons take: fine under an hour, coarser above.
export const stepFor = (minutes: number): number => (minutes < 60 ? 5 : 15)

export function toggle(snap: Snapshot, id: string, now: number): Snapshot {
  const reminder = find(snap, id)

  if (reminder === undefined) {
    return snap
  }

  const changed = withReminder(snap, id, { enabled: !reminder.enabled })

  return reminder.enabled ? changed : markDone(changed, [id], now)
}

export const setSound = (snap: Snapshot, sound: boolean): Snapshot => ({ ...snap, settings: { ...snap.settings, sound } })

export const setCheckUpdates = (snap: Snapshot, check: boolean): Snapshot => ({ ...snap, update: { ...snap.update, check } })

export const setAway = (snap: Snapshot, minutes: number): Snapshot => ({
  ...snap,
  settings: { ...snap.settings, awayMin: clamp(Math.round(minutes), MIN_AWAY, MAX_AWAY) },
})

// Sets each built-in reminder to the interval it ships with. What is on or off, and anyone's
// own reminders, are left alone. Says which ones changed.
export function useRecommended(snap: Snapshot, now: number): { snap: Snapshot; changed: string[] } {
  let next = snap
  const changed: string[] = []

  for (const reminder of snap.reminders) {
    const template = reminder.builtIn ? templateOf(reminder.id) : undefined

    if (template !== undefined && reminder.everyMin !== template.defaultEveryMin) {
      next = setEvery(next, reminder.id, template.defaultEveryMin, now)
      changed.push(`${reminder.name} ${template.defaultEveryMin}`)
    }
  }

  return { snap: next, changed }
}

// What a person types to add a reminder: an emoji, a name, the minutes, and after a bar its
// toast line: `🍎 Snack 90 | Time to eat something`. The emoji and the minutes may be left out.
export type NewReminder = { name: string; emoji: string; everyMin: number; message?: string }

export function parseNewReminder(input: string): NewReminder | string {
  const [main = '', ...after] = input.split('|')
  const words = main.trim().split(/\s+/).filter(word => word !== '')
  const message = after.join('|').trim()
  const first = words[0]
  const hasEmoji = first !== undefined && /[^\u0000-\u007f]/u.test(first)
  const emoji = hasEmoji ? (first as string).slice(0, 8) : '⏰'
  const rest = hasEmoji ? words.slice(1) : words
  const last = rest[rest.length - 1]
  const hasMinutes = last !== undefined && /^\d+$/.test(last)
  const everyMin = hasMinutes ? Number(last) : 60
  const name = (hasMinutes ? rest.slice(0, -1) : rest).join(' ').trim()

  if (name === '') {
    return 'Give it a name, for example: 🍎 Snack 90 | Time to eat something'
  }

  if (name.length > MAX_NAME) {
    return `Keep the name to ${MAX_NAME} characters or fewer.`
  }

  if (everyMin < MIN_EVERY || everyMin > MAX_EVERY) {
    return `Minutes must be between ${MIN_EVERY} and ${MAX_EVERY}.`
  }

  return { name, emoji, everyMin, ...(message === '' ? {} : { message: message.slice(0, 200) }) }
}

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Adds a reminder, charging from now. Says why not when it cannot.
export function addReminder(snap: Snapshot, input: NewReminder, now: number): Snapshot | string {
  if (snap.reminders.length >= MAX_REMINDERS) {
    return `That is the most reminders there can be (${MAX_REMINDERS}). Delete one first.`
  }

  if (snap.reminders.some(reminder => reminder.name.toLowerCase() === input.name.toLowerCase())) {
    return `There is already a reminder called "${input.name}".`
  }

  const base = `custom-${slug(input.name) || 'reminder'}`
  const id = snap.reminders.some(reminder => reminder.id === base) || templateOf(base) !== undefined ? `${base}-${now}` : base
  const customs = snap.reminders.filter(reminder => !reminder.builtIn).length
  const reminder: Reminder = {
    id,
    name: input.name,
    emoji: input.emoji,
    color: CUSTOM_COLORS[customs % CUSTOM_COLORS.length] ?? '#f2994a',
    everyMin: clamp(Math.round(input.everyMin), MIN_EVERY, MAX_EVERY),
    enabled: true,
    resetOnAway: false,
    builtIn: false,
    ...(input.message === undefined ? {} : { message: input.message }),
  }

  return { ...snap, reminders: [...snap.reminders, reminder], clocks: { ...snap.clocks, [id]: { since: now, firedFor: -1 } } }
}

// Deletes a reminder and its charge. A built-in one stays in `seeded`, so it stays gone until
// it is restored.
export function removeReminder(snap: Snapshot, id: string): Snapshot {
  const { [id]: _gone, ...clocks } = snap.clocks

  return { ...snap, reminders: snap.reminders.filter(reminder => reminder.id !== id), clocks }
}

// The built-in reminders that are not in the list now.
export const missingBuiltIns = (snap: Snapshot): Template[] =>
  TEMPLATES.filter(template => !snap.reminders.some(reminder => reminder.id === template.id))

// Puts the deleted built-in reminders back, as they ship (Medicine off, the rest on).
export function restoreBuiltIns(snap: Snapshot, now: number): Snapshot {
  const missing = missingBuiltIns(snap).slice(0, Math.max(0, MAX_REMINDERS - snap.reminders.length))

  return {
    ...snap,
    reminders: [...snap.reminders, ...missing.map(fromTemplate)],
    clocks: { ...snap.clocks, ...Object.fromEntries(missing.map(template => [template.id, { since: now, firedFor: -1 }])) },
  }
}

// A prompt after a long silence counts as a break: the reminders marked `resetOnAway` start
// over, or every enabled one when a session starts after the gap. Always notes the activity.
export function awayReset(snap: Snapshot, now: number, scope: 'prompt' | 'startup'): { snap: Snapshot; reset: string[] } {
  const touched = { ...snap, lastActiveAt: now }

  if (now - snap.lastActiveAt < snap.settings.awayMin * MINUTE) {
    return { snap: touched, reset: [] }
  }

  const reset = snap.reminders.filter(reminder => reminder.enabled && (scope === 'startup' || reminder.resetOnAway)).map(reminder => reminder.id)

  return { snap: markDone(touched, reset, now), reset }
}

export function formatLeft(ms: number): string {
  if (ms <= 0) {
    return 'now'
  }

  const minutes = Math.ceil(ms / MINUTE)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const rest = minutes % 60

  return rest === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h${String(rest).padStart(2, '0')}`
}

// A circle that fills a quarter at a time; solid only once it is due.
export function glyphFor(charge: Charge): string {
  if (charge.isReady) {
    return '●'
  }

  return charge.fraction < 0.25 ? '○' : charge.fraction < 0.5 ? '◔' : charge.fraction < 0.75 ? '◑' : '◕'
}

// The pop-up's headline: "Time for some water", or "Snack time" for one of your own.
export const headlineOf = (reminder: Reminder): string =>
  (reminder.builtIn ? templateOf(reminder.id)?.headline : undefined) ?? `${reminder.name} time`

// What the interval counts, for the line beneath the headline: "20 min of screen time".
export const sinceOf = (reminder: Reminder): string =>
  (reminder.builtIn ? templateOf(reminder.id)?.since : undefined) ?? 'since your last one'

// Names in a sentence: "water", "water and eyes", "water, eyes and walk".
export const listNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

// The toast's line. A built-in reminder's wording moves on each cycle, so it stays fresh.
export function messageFor(reminder: Reminder, since: number): string {
  const template = reminder.builtIn ? templateOf(reminder.id) : undefined

  return (
    template?.messages[Math.floor(since / MINUTE) % template.messages.length] ??
    reminder.message ??
    `${headlineOf(reminder)}. ${reminder.emoji}`
  )
}

// The fun fact at `index` of a built-in reminder's facts; nothing for a custom one.
export const factOf = (reminder: Reminder, index: number): string | undefined => {
  const facts = reminder.builtIn ? (templateOf(reminder.id)?.facts ?? []) : []

  return facts[index % Math.max(1, facts.length)]
}

export const factCount = (reminder: Reminder): number => (reminder.builtIn ? (templateOf(reminder.id)?.facts.length ?? 0) : 0)

export const whyOf = (reminder: Reminder): string =>
  (reminder.builtIn ? templateOf(reminder.id)?.why : undefined) ??
  reminder.message ??
  `Your reminder for ${reminder.name.toLowerCase()}, every ${reminder.everyMin} minutes.`
