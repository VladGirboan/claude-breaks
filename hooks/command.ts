import type { Snapshot } from '../types'
import {
  addReminder,
  chargeOf,
  formatLeft,
  itemsOf,
  lookup,
  markDone,
  MAX_REMINDERS,
  missingBuiltIns,
  parseNewReminder,
  pause,
  removeReminder,
  restoreBuiltIns,
  resume,
  setEvery,
  setSound,
  snooze,
  toggle,
  useRecommended,
} from './reminders'

// What `/breaks ...` does. Pure: it takes the arguments and the snapshot, and says what to
// store, what to print, and whether to open the settings or send a test reminder.

export type Outcome = { snap?: Snapshot; text?: string; open?: true; test?: true }

const HELP = [
  '/breaks                       open the settings',
  '/breaks status                what is charging',
  '/breaks done [name]           start a reminder again (all ready ones when no name)',
  '/breaks snooze [name] [min]   ready again in 10 minutes, or the minutes given',
  '/breaks pause | resume        stop and restart every cooldown',
  '/breaks on <name> | off <name>',
  '/breaks set <name> <minutes>  how often a reminder comes',
  '/breaks add <emoji> <name> <minutes> | <message>   a reminder of your own',
  '/breaks delete <name>         remove a reminder',
  '/breaks restore               bring back the built-in reminders you deleted',
  '/breaks defaults              set the built-in reminders to the recommended intervals',
  '/breaks sound on | off',
  '/breaks test                  send a sample pop-up',
].join('\n')

const namesOf = (snap: Snapshot): string => snap.reminders.map(reminder => reminder.name.toLowerCase()).join(', ')

export function runBreaksCommand(args: string, snap: Snapshot, now: number): Outcome {
  const trimmed = args.trim()
  const [verb = '', ...rest] = trimmed.split(/\s+/).filter(word => word !== '')
  const target = lookup(snap, rest[0])
  const all = snap.reminders.map(reminder => reminder.id)
  const ready = itemsOf(snap, now).filter(item => item.charge.isReady).map(item => item.reminder.id)
  const unknown = (word: string | undefined): Outcome => ({ text: `No reminder called "${word ?? ''}". They are: ${namesOf(snap)}.` })

  switch (verb.toLowerCase()) {
    case '':
      return { open: true }
    case 'help':
      return { text: HELP }
    case 'test':
      return { test: true }
    case 'status': {
      const lines = snap.reminders.map(reminder => {
        const state = !reminder.enabled ? 'off' : formatLeft(chargeOf(reminder.everyMin, snap.clocks[reminder.id] ?? { since: now, firedFor: -1 }, now, snap.pausedAt).leftMs)

        return `${reminder.emoji} ${reminder.name.padEnd(12)} every ${String(reminder.everyMin).padStart(3)} min   ${state}`
      })

      return { text: [...lines, snap.pausedAt === null ? '' : 'paused: /breaks resume'].filter(line => line !== '').join('\n') }
    }
    case 'pause':
      return { snap: pause(snap, now), text: 'Paused. Every cooldown stops where it is.' }
    case 'resume':
      return { snap: resume(snap, now), text: 'Resumed.' }
    case 'done': {
      const ids = rest[0] === undefined ? ready : rest[0] === 'all' ? all : target === undefined ? undefined : [target.id]

      if (ids === undefined) {
        return unknown(rest[0])
      }

      return ids.length === 0 ? { text: 'Nothing is ready yet.' } : { snap: markDone(snap, ids, now), text: `Started again: ${ids.join(', ')}.` }
    }
    case 'snooze': {
      const minutes = Number(rest.find(word => /^\d+$/.test(word)) ?? 10)
      const named = rest.find(word => !/^\d+$/.test(word))
      const one = named === undefined ? undefined : lookup(snap, named)

      if (named !== undefined && named !== 'all' && one === undefined) {
        return unknown(named)
      }

      const ids = named === undefined ? ready : named === 'all' ? all : one === undefined ? [] : [one.id]

      return ids.length === 0 ? { text: 'Nothing is ready yet.' } : { snap: snooze(snap, ids, minutes, now), text: `Snoozed ${ids.join(', ')} for ${minutes} min.` }
    }
    case 'on':
    case 'off': {
      if (target === undefined) {
        return rest[0] === undefined ? { text: `Which one? ${namesOf(snap)}.` } : unknown(rest[0])
      }

      const wants = verb.toLowerCase() === 'on'

      return target.enabled === wants
        ? { text: `${target.name} is already ${wants ? 'on' : 'off'}.` }
        : { snap: toggle(snap, target.id, now), text: `${target.name} is ${wants ? 'on' : 'off'}.` }
    }
    case 'set': {
      const minutes = Number(rest[1])

      if (target === undefined || !Number.isFinite(minutes) || minutes < 1) {
        return { text: 'Usage: /breaks set <name> <minutes>, for example /breaks set water 40' }
      }

      const next = setEvery(snap, target.id, minutes, now)

      return { snap: next, text: `${target.name} every ${next.reminders.find(reminder => reminder.id === target.id)?.everyMin} min.` }
    }
    case 'add': {
      const parsed = parseNewReminder(trimmed.slice(verb.length))

      if (typeof parsed === 'string') {
        return { text: parsed }
      }

      const added = addReminder(snap, parsed, now)

      return typeof added === 'string'
        ? { text: added }
        : { snap: added, text: `Added ${parsed.emoji} ${parsed.name}, every ${parsed.everyMin} min.` }
    }
    case 'delete':
    case 'remove': {
      if (target === undefined) {
        return rest[0] === undefined ? { text: `Which one? ${namesOf(snap)}.` } : unknown(rest[0])
      }

      return { snap: removeReminder(snap, target.id), text: `Deleted ${target.name}.${target.builtIn ? ' /breaks restore brings it back.' : ''}` }
    }
    case 'restore': {
      const missing = missingBuiltIns(snap)

      if (missing.length === 0) {
        return { text: 'Nothing to restore: every built-in reminder is here.' }
      }

      return snap.reminders.length >= MAX_REMINDERS
        ? { text: `There is no room (${MAX_REMINDERS} reminders). Delete one first.` }
        : { snap: restoreBuiltIns(snap, now), text: `Restored: ${missing.map(template => template.name).join(', ')}.` }
    }
    case 'defaults': {
      const used = useRecommended(snap, now)

      return used.changed.length === 0
        ? { text: 'The built-in reminders are already at the recommended intervals.' }
        : { snap: used.snap, text: `Recommended intervals set (minutes): ${used.changed.join(', ')}.` }
    }
    case 'sound': {
      const word = (rest[0] ?? '').toLowerCase()

      return word === 'on' || word === 'off'
        ? { snap: setSound(snap, word === 'on'), text: `Sound ${word}.` }
        : { text: 'Usage: /breaks sound on | off' }
    }
    default:
      return { text: `Unknown option "${verb}".\n${HELP}` }
  }
}
