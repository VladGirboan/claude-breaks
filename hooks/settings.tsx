import type { ElementTable } from 'claude-code'

import type { Snapshot } from '../types'
import type { Ui } from './band'
import {
  chargeOf,
  doneLabelOf,
  formatLeft,
  glyphFor,
  MAX_AWAY,
  MAX_EVERY,
  MAX_REMINDERS,
  MIN_AWAY,
  MIN_EVERY,
  missingBuiltIns,
  stepFor,
} from './reminders'
import { newerThan, VERSION } from './version'

// The settings pane: each reminder on a row with its switch, how often it comes, how full it is
// and the buttons that act on it, in columns; then a line to add one of your own, and a box of
// options that apply to all of them.

export type PaneUi = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text' | 'Button' | 'Input'>

export type SettingsActions = {
  toggle: (id: string) => void
  every: (id: string, minutes: number) => void
  done: (id: string) => void
  snooze: (id: string) => void
  askDelete: (id: string | null) => void
  remove: (id: string) => void
  add: (input: string) => void
  restore: () => void
  sound: () => void
  away: (minutes: number) => void
  pause: () => void
  checkUpdates: () => void
  checkNow: () => void
}

const mark = (on: boolean): string => (on ? '●' : '○')

// Columns the rows line up on, so the reminders read as a table and not a heap of buttons.
const NAME_WIDTH = 18
const EVERY_WIDTH = 24
const LEFT_WIDTH = 10
const LABEL_WIDTH = 34
const RULE = '#6b7280'

export function settingsPane(ui: PaneUi & Ui, snap: Snapshot, now: number, pendingDelete: string | null, actions: SettingsActions) {
  const { Box, Text, Button, Input } = ui
  const { settings } = snap
  const isPaused = snap.pausedAt !== null
  const hasRoom = snap.reminders.length < MAX_REMINDERS
  const missing = missingBuiltIns(snap)
  const newer = newerThan(snap.update)

  return (
    <Box flexDirection="column" rowGap={1} paddingX={1}>
      <Text dimColor>Each reminder charges while you work. When it is full you get a pop-up. Press its button to start it over.</Text>

      <Box flexDirection="column" rowGap={1}>
        {snap.reminders.length === 0 ? <Text dimColor>You have no reminders. Add one below, or restore the built-in ones.</Text> : ''}
        {snap.reminders.map(reminder => {
          const charge = chargeOf(reminder.everyMin, snap.clocks[reminder.id] ?? { since: now, firedFor: -1 }, now, snap.pausedAt)
          const isAsking = pendingDelete === reminder.id

          return (
            <Box key={reminder.id} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
              <Box minWidth={NAME_WIDTH}>
                <Button
                  key={`toggle-${reminder.id}`}
                  label={`${mark(reminder.enabled)} ${reminder.emoji} ${reminder.name}`}
                  plain
                  dimColor={!reminder.enabled}
                  onPress={() => actions.toggle(reminder.id)}
                />
              </Box>
              <Box flexDirection="row" alignItems="center" columnGap={1} minWidth={EVERY_WIDTH}>
                <Text dimColor>every</Text>
                <Button
                  key={`less-${reminder.id}`}
                  label="−"
                  plain
                  onPress={() => actions.every(reminder.id, Math.max(MIN_EVERY, reminder.everyMin - stepFor(reminder.everyMin - 1)))}
                />
                <Box minWidth={8} justifyContent="center">
                  <Text>{`${reminder.everyMin} min`}</Text>
                </Box>
                <Button
                  key={`more-${reminder.id}`}
                  label="+"
                  plain
                  onPress={() => actions.every(reminder.id, Math.min(MAX_EVERY, reminder.everyMin + stepFor(reminder.everyMin)))}
                />
              </Box>
              <Box minWidth={LEFT_WIDTH}>
                {reminder.enabled ? (
                  <Text>
                    <Text color={reminder.color}>{glyphFor(charge)}</Text>
                    {` ${formatLeft(charge.leftMs)}`}
                  </Text>
                ) : (
                  <Text dimColor>off</Text>
                )}
              </Box>
              <Box flexDirection="row" alignItems="center" columnGap={2}>
                {reminder.enabled ? <Button key={`done-${reminder.id}`} label={doneLabelOf(reminder)} dimColor onPress={() => actions.done(reminder.id)} /> : ''}
                {reminder.enabled ? <Button key={`snooze-${reminder.id}`} label="Snooze 10m" dimColor onPress={() => actions.snooze(reminder.id)} /> : ''}
                {isAsking ? <Text color="#eb5757">{`Delete ${reminder.name}?`}</Text> : ''}
                {isAsking ? <Button key={`confirm-${reminder.id}`} label="Yes, delete" variant="primary" onPress={() => actions.remove(reminder.id)} /> : ''}
                {isAsking ? (
                  <Button key={`keep-${reminder.id}`} label="Keep" dimColor onPress={() => actions.askDelete(null)} />
                ) : (
                  <Button key={`delete-${reminder.id}`} label="Delete" dimColor onPress={() => actions.askDelete(reminder.id)} />
                )}
              </Box>
            </Box>
          )
        })}
      </Box>

      <Box flexDirection="column" rowGap={1}>
        {hasRoom ? (
          <Input
            key="add"
            label="Add your own"
            placeholder="🍎 Snack 90 | Time to eat something"
            value=""
            submitLabel="add"
            onSubmit={(value: string) => actions.add(value)}
          />
        ) : (
          <Text dimColor>{`${MAX_REMINDERS} reminders is the most. Delete one to add another.`}</Text>
        )}
        <Text dimColor>An emoji, a name, the minutes between reminders, then | and the message. The emoji and the minutes are optional (60 by default).</Text>
        {missing.length > 0 ? (
          <Box flexDirection="row" alignItems="center" columnGap={2}>
            <Button key="restore" label="Restore built-ins" dimColor onPress={actions.restore} />
            <Text dimColor>{missing.map(template => `${template.emoji} ${template.name}`).join('  ')}</Text>
          </Box>
        ) : (
          ''
        )}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={RULE} paddingX={2} paddingY={1} rowGap={1}>
        <Text bold>Options</Text>

        <Box flexDirection="row" alignItems="center" columnGap={2}>
          <Box minWidth={LABEL_WIDTH}>
            <Text>Chime when a reminder is due</Text>
          </Box>
          <Button key="sound" label={`${mark(settings.sound)} ${settings.sound ? 'on' : 'off'}`} plain dimColor={!settings.sound} onPress={actions.sound} />
        </Box>

        <Box flexDirection="row" alignItems="center" columnGap={2}>
          <Box minWidth={LABEL_WIDTH}>
            <Text>Time away counts as a break after</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" columnGap={1}>
            <Button key="away-less" label="−" plain onPress={() => actions.away(Math.max(MIN_AWAY, settings.awayMin - 5))} />
            <Box minWidth={8} justifyContent="center">
              <Text>{`${settings.awayMin} min`}</Text>
            </Box>
            <Button key="away-more" label="+" plain onPress={() => actions.away(Math.min(MAX_AWAY, settings.awayMin + 5))} />
          </Box>
        </Box>

        <Box flexDirection="row" alignItems="center" columnGap={2}>
          <Box minWidth={LABEL_WIDTH}>
            <Text>Pause every reminder</Text>
          </Box>
          <Button key="pause" label={isPaused ? 'Resume all' : 'Pause all'} dimColor onPress={actions.pause} />
        </Box>

        <Box flexDirection="row" alignItems="center" columnGap={2}>
          <Box minWidth={LABEL_WIDTH}>
            <Text>Look for updates once a week</Text>
          </Box>
          <Button
            key="updates"
            label={`${mark(snap.update.check)} ${snap.update.check ? 'on' : 'off'}`}
            plain
            dimColor={!snap.update.check}
            onPress={actions.checkUpdates}
          />
          <Button key="check-now" label="Check now" dimColor onPress={actions.checkNow} />
        </Box>
        <Text dimColor>
          {newer === undefined
            ? `You have breaks ${VERSION}. Checking asks Claude Code for permission to read one file on GitHub.`
            : `breaks ${newer} is out (you have ${VERSION}). Run /breaks update to see how to get it.`}
        </Text>
      </Box>

      <Text dimColor>After the time away, a prompt counts as a break for eyes, stretch and walk. The chime plays on macOS only. Esc closes.</Text>
    </Box>
  )
}
