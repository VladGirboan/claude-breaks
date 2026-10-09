// One reminder in the person's list: a built-in one (it has a template in hooks/templates.ts
// with its wording and facts, found by `id`) or one they added.
export type Reminder = {
  id: string
  name: string
  emoji: string
  color: string
  everyMin: number
  enabled: boolean
  // Time away from the keyboard counts as taking this one.
  resetOnAway: boolean
  builtIn: boolean
  // A custom reminder's own toast line; a built-in one takes its wording from its template.
  message?: string
}

export type Settings = {
  // Play a chime with the reminder, where the host can (macOS today).
  sound: boolean
  // Minutes without a prompt that count as having stepped away.
  awayMin: number
}

// One reminder's charge. It is ready `everyMin` after `since`; `firedFor` is the `since`
// the pop-up was already sent for, so a cycle announces once.
export type Clock = { since: number; firedFor: number }

// Whether a newer version of the mod is out. Looking costs a web request that Claude Code asks
// permission for, so it only happens when `check` is on (or when the person asks for it).
export type UpdateState = {
  // Look once a week, when a session starts.
  check: boolean
  // When it last looked, and the newest version it saw ('' before the first look).
  checkedAt: number
  latest: string
  // The version the person was last told about, so a version is announced once.
  toldAbout: string
}

// Everything the mod keeps in `$.store`, under one key, and mirrors in `$.state` to draw from.
export type Snapshot = {
  settings: Settings
  reminders: Reminder[]
  clocks: Record<string, Clock>
  // The built-in reminders this person has already been given, so a deleted one stays gone
  // and a new one added in an update appears once.
  seeded: string[]
  // Set while paused: charging stops, and resuming moves every `since` on by the pause.
  pausedAt: number | null
  // The last time the person sent a prompt, from any session.
  lastActiveAt: number
  update: UpdateState
}

// The pop-up: which reminders it announces, and the fun fact picked for each (an index into
// the template's facts, kept so a redraw shows the same one).
export type Alert = { ids: string[]; facts: Record<string, number>; preview?: boolean }

declare module 'claude-code' {
  interface PluginState {
    breaks: {
      snap: Snapshot | null
      // The time of the last tick, so a draw reads it and the band moves on every tick.
      now: number
      alert: Alert | null
      // The reminder whose delete is waiting for a second press.
      pendingDelete: string | null
    }
  }
}
