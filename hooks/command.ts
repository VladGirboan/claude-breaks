import type { Snapshot } from '../types'
import { newerThan, VERSION } from './version'
import {
  addReminder,
  chargeOf,
  formatLeft,
  itemsOf,
  listNames,
  lookup,
  markDone,
  MAX_REMINDERS,
  missingBuiltIns,
  parseNewReminder,
  pause,
  removeReminder,
  restoreBuiltIns,
  resume,
  setCheckUpdates,
  setEvery,
  setSound,
  snooze,
  toggle,
  useRecommended,
} from './reminders'

// What `/breaks ...` does. Pure: it takes the arguments and the snapshot, and says what to
// store, what to print, and whether to open the settings or send a test reminder.

export type Outcome = { snap?: Snapshot; text?: string; open?: true; test?: true; check?: true }

const HELP = [
  '/breaks                       open the settings',
  '/breaks status                what is charging, and how long is left',
  '/breaks done [name]           you took the break: charge it again (every due one if no name)',
  '/breaks snooze [name] [min]   remind me again in 10 minutes, or the minutes given',
  '/breaks pause | resume        hold every timer, then let them run again',
  '/breaks on <name> | off <name>',
  '/breaks set <name> <minutes>  how often a reminder comes',
  '/breaks add <emoji> <name> <minutes> | <message>   a reminder of your own',
  '/breaks delete <name>         remove a reminder',
  '/breaks restore               bring back the built-in reminders you deleted',
  '/breaks defaults              set the built-in reminders to the recommended intervals',
  '/breaks sound on | off        the chime (macOS only)',
  '/breaks update                look for a newer version on GitHub',
  '/breaks update on | off       look once a week when a session starts',
  '/breaks test                  show a sample pop-up',
].join('\n')

const nameList = (snap: Snapshot, ids: readonly string[]): string =>
  listNames(ids.map(id => snap.reminders.find(reminder => reminder.id === id)?.name ?? id))

const namesOf = (snap: Snapshot): string => snap.reminders.map(reminder => reminder.name.toLowerCase()).join(', ')

export function runBreaksCommand(args: string, snap: Snapshot, now: number): Outcome {
  const trimmed = args.trim()
  const [verb = '', ...rest] = trimmed.split(/\s+/).filter(word => word !== '')
  const target = lookup(snap, rest[0])
  const all = snap.reminders.map(reminder => reminder.id)
  const ready = itemsOf(snap, now).filter(item => item.charge.isReady).map(item => item.reminder.id)
  const unknown = (word: string | undefined): Outcome => ({ text: `No reminder called "${word ?? ''}". You have: ${namesOf(snap)}.` })

  switch (verb.toLowerCase()) {
    case '':
      return { open: true }
    case 'help':
      return { text: HELP }
    case 'test':
      return { test: true }
    case 'status': {
      const lines = snap.reminders.map(reminder => {
        const left = formatLeft(chargeOf(reminder.everyMin, snap.clocks[reminder.id] ?? { since: now, firedFor: -1 }, now, snap.pausedAt).leftMs)
        const state = !reminder.enabled ? 'off' : left === 'now' ? 'due now' : `${left} left`

        return `${reminder.emoji} ${reminder.name.padEnd(12)} every ${String(reminder.everyMin).padStart(3)} min   ${state}`
      })
      const newer = newerThan(snap.update)
      const notes = [
        snap.pausedAt === null ? '' : 'Paused. /breaks resume starts the timers again.',
        newer === undefined ? '' : `Version ${newer} is out (you have ${VERSION}). /breaks update says how to get it.`,
      ]

      return { text: [...lines, ...notes].filter(line => line !== '').join('\n') }
    }
    case 'pause':
      return { snap: pause(snap, now), text: 'Paused. Every timer holds where it is until you run /breaks resume.' }
    case 'resume':
      return { snap: resume(snap, now), text: 'Resumed. The timers are running again.' }
    case 'done': {
      const ids = rest[0] === undefined ? ready : rest[0] === 'all' ? all : target === undefined ? undefined : [target.id]

      if (ids === undefined) {
        return unknown(rest[0])
      }

      return ids.length === 0
        ? { text: 'Nothing is due yet.' }
        : { snap: markDone(snap, ids, now), text: `Nice. ${nameList(snap, ids)} will charge again from now.` }
    }
    case 'snooze': {
      const minutes = Number(rest.find(word => /^\d+$/.test(word)) ?? 10)
      const named = rest.find(word => !/^\d+$/.test(word))
      const one = named === undefined ? undefined : lookup(snap, named)

      if (named !== undefined && named !== 'all' && one === undefined) {
        return unknown(named)
      }

      const ids = named === undefined ? ready : named === 'all' ? all : one === undefined ? [] : [one.id]

      return ids.length === 0
        ? { text: 'Nothing is due yet.' }
        : { snap: snooze(snap, ids, minutes, now), text: `Snoozed ${nameList(snap, ids)}. It comes back in ${minutes} min.` }
    }
    case 'on':
    case 'off': {
      if (target === undefined) {
        return rest[0] === undefined ? { text: `Which one? ${namesOf(snap)}.` } : unknown(rest[0])
      }

      const wants = verb.toLowerCase() === 'on'

      return target.enabled === wants
        ? { text: `${target.name} is already ${wants ? 'on' : 'off'}.` }
        : { snap: toggle(snap, target.id, now), text: `${target.name} is now ${wants ? 'on' : 'off'}.` }
    }
    case 'set': {
      const minutes = Number(rest[1])

      if (target === undefined || !Number.isFinite(minutes) || minutes < 1) {
        return { text: 'Usage: /breaks set <name> <minutes>, for example /breaks set water 40' }
      }

      const next = setEvery(snap, target.id, minutes, now)

      return { snap: next, text: `${target.name} will remind you every ${next.reminders.find(reminder => reminder.id === target.id)?.everyMin} min.` }
    }
    case 'add': {
      const parsed = parseNewReminder(trimmed.slice(verb.length))

      if (typeof parsed === 'string') {
        return { text: parsed }
      }

      const added = addReminder(snap, parsed, now)

      return typeof added === 'string'
        ? { text: added }
        : { snap: added, text: `Added ${parsed.emoji} ${parsed.name}. It will remind you every ${parsed.everyMin} min.` }
    }
    case 'delete':
    case 'remove': {
      if (target === undefined) {
        return rest[0] === undefined ? { text: `Which one? ${namesOf(snap)}.` } : unknown(rest[0])
      }

      return { snap: removeReminder(snap, target.id), text: `Deleted ${target.name}.${target.builtIn ? ' You can bring it back with /breaks restore.' : ''}` }
    }
    case 'restore': {
      const missing = missingBuiltIns(snap)

      if (missing.length === 0) {
        return { text: 'Nothing to restore. All the built-in reminders are already here.' }
      }

      return snap.reminders.length >= MAX_REMINDERS
        ? { text: `There is no room: ${MAX_REMINDERS} reminders is the most. Delete one first.` }
        : { snap: restoreBuiltIns(snap, now), text: `Restored ${listNames(missing.map(template => template.name))}.` }
    }
    case 'defaults': {
      const used = useRecommended(snap, now)

      return used.changed.length === 0
        ? { text: 'The built-in reminders already use the recommended intervals.' }
        : { snap: used.snap, text: `Recommended intervals set (minutes): ${used.changed.join(', ')}.` }
    }
    case 'sound': {
      const word = (rest[0] ?? '').toLowerCase()

      return word === 'on' || word === 'off'
        ? { snap: setSound(snap, word === 'on'), text: `The chime is ${word}.` }
        : { text: 'Usage: /breaks sound on | off' }
    }
    case 'update': {
      const word = (rest[0] ?? '').toLowerCase()

      if (word === 'on' || word === 'off') {
        return {
          snap: setCheckUpdates(snap, word === 'on'),
          text:
            word === 'on'
              ? 'Update check is on. Once a week, when a session starts, breaks looks on GitHub for a newer version. Claude Code asks your permission for that web request; allow raw.githubusercontent.com once and it stays quiet.'
              : 'Update check is off. /breaks update still looks whenever you ask.',
        }
      }

      return word === '' ? { check: true } : { text: 'Usage: /breaks update | /breaks update on | /breaks update off' }
    }
    default:
      return { text: `I don't know "${verb}". Here is what /breaks can do:\n${HELP}` }
  }
}
