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

// The settings pane: each reminder on a row, with its switch, how often it comes, how full it
// is and the buttons that act on it; then a line to add one of your own, and the settings that
// apply to all of them.

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
}

const mark = (on: boolean): string => (on ? '●' : '○')

export function settingsPane(ui: PaneUi & Ui, snap: Snapshot, now: number, pendingDelete: string | null, actions: SettingsActions) {
  const { Box, Text, Button, Input } = ui
  const { settings } = snap
  const isPaused = snap.pausedAt !== null
  const hasRoom = snap.reminders.length < MAX_REMINDERS
  const missing = missingBuiltIns(snap)

  return (
    <Box flexDirection="column" rowGap={1}>
      <Text dimColor>Each reminder charges while you work. When it is full you get a pop-up, and a button to start it again.</Text>

      <Box flexDirection="column" rowGap={1}>
        {snap.reminders.length === 0 ? <Text dimColor>No reminders. Add one below, or restore the built-in ones.</Text> : ''}
        {snap.reminders.map(reminder => {
          const charge = chargeOf(reminder.everyMin, snap.clocks[reminder.id] ?? { since: now, firedFor: -1 }, now, snap.pausedAt)

          return (
            <Box key={reminder.id} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
              <Button
                key={`toggle-${reminder.id}`}
                label={`${mark(reminder.enabled)} ${reminder.emoji} ${reminder.name}`}
                plain
                dimColor={!reminder.enabled}
                onPress={() => actions.toggle(reminder.id)}
              />
              <Text dimColor>every</Text>
              <Button
                key={`less-${reminder.id}`}
                label="−"
                plain
                onPress={() => actions.every(reminder.id, Math.max(MIN_EVERY, reminder.everyMin - stepFor(reminder.everyMin - 1)))}
              />
              <Text>{`${reminder.everyMin} min`}</Text>
              <Button
                key={`more-${reminder.id}`}
                label="+"
                plain
                onPress={() => actions.every(reminder.id, Math.min(MAX_EVERY, reminder.everyMin + stepFor(reminder.everyMin)))}
              />
              {reminder.enabled ? (
                <Text>
                  <Text color={reminder.color}>{glyphFor(charge)}</Text>
                  {` ${formatLeft(charge.leftMs)}`}
                </Text>
              ) : (
                <Text dimColor>off</Text>
              )}
              {reminder.enabled ? <Button key={`done-${reminder.id}`} label={doneLabelOf(reminder)} dimColor onPress={() => actions.done(reminder.id)} /> : ''}
              {reminder.enabled ? <Button key={`snooze-${reminder.id}`} label="Snooze 10m" dimColor onPress={() => actions.snooze(reminder.id)} /> : ''}
              {pendingDelete === reminder.id ? (
                <Text color="#eb5757">{`Delete ${reminder.name}?`}</Text>
              ) : (
                ''
              )}
              {pendingDelete === reminder.id ? (
                <Button key={`confirm-${reminder.id}`} label="Yes, delete" variant="primary" onPress={() => actions.remove(reminder.id)} />
              ) : (
                ''
              )}
              {pendingDelete === reminder.id ? (
                <Button key={`keep-${reminder.id}`} label="Keep" dimColor onPress={() => actions.askDelete(null)} />
              ) : (
                <Button key={`delete-${reminder.id}`} label="Delete" dimColor onPress={() => actions.askDelete(reminder.id)} />
              )}
            </Box>
          )
        })}
      </Box>

      <Box flexDirection="column">
        {hasRoom ? (
          <Input
            key="add"
            label="Add a reminder"
            placeholder="🍎 Snack 90 | Time to eat something"
            value=""
            submitLabel="add"
            onSubmit={(value: string) => actions.add(value)}
          />
        ) : (
          <Text dimColor>{`That is the most reminders there can be (${MAX_REMINDERS}). Delete one to add another.`}</Text>
        )}
        <Text dimColor>An emoji, a name, the minutes between reminders, and after a bar the line to show. Emoji and minutes are optional (60 min).</Text>
        {missing.length > 0 ? (
          <Box flexDirection="row" columnGap={2}>
            <Button key="restore" label="Restore built-ins" dimColor onPress={actions.restore} />
            <Text dimColor>{missing.map(template => `${template.emoji} ${template.name}`).join('  ')}</Text>
          </Box>
        ) : (
          ''
        )}
      </Box>

      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
        <Button key="sound" label={`${mark(settings.sound)} sound`} plain dimColor={!settings.sound} onPress={actions.sound} />
        <Text dimColor>away after</Text>
        <Button key="away-less" label="−" plain onPress={() => actions.away(Math.max(MIN_AWAY, settings.awayMin - 5))} />
        <Text>{`${settings.awayMin} min`}</Text>
        <Button key="away-more" label="+" plain onPress={() => actions.away(Math.min(MAX_AWAY, settings.awayMin + 5))} />
        <Button key="pause" label={isPaused ? 'Resume all' : 'Pause all'} dimColor onPress={actions.pause} />
      </Box>

      <Text dimColor>
        A prompt after that long away counts as a break for the reminders that want it. Sound plays on macOS. Esc closes.
      </Text>
    </Box>
  )
}
