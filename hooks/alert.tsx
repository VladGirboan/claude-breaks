import type { ElementTable } from 'claude-code'

import type { Reminder } from '../types'
import type { Ui, SvgElement } from './band'
import { heroSvg } from './hero'
import { doneLabelOf, whyOf } from './reminders'

// The pop-up: a card for each reminder that is ready, with a picture, why it matters, a fun
// fact, and the buttons to start it again or put it off. The desktop draws a large animated
// banner; the terminal, a bordered card in the reminder's color.

export type AlertEntry = { reminder: Reminder; fact: string | undefined }

export type AlertActions = {
  done: (id: string) => void
  snooze: (id: string) => void
  dismiss: () => void
}

export type AlertUi = Pick<ElementTable, 'Box' | 'Text' | 'Button'> & Ui

const SNOOZE_MIN = 10

function words(ui: AlertUi, entry: AlertEntry) {
  const { Text } = ui
  const { reminder, fact } = entry

  return [
    <Text>{whyOf(reminder)}</Text>,
    fact === undefined ? (
      ''
    ) : (
      <Text>
        <Text bold color={reminder.color}>
          Did you know?{' '}
        </Text>
        {fact}
      </Text>
    ),
  ]
}

function buttons(ui: AlertUi, entry: AlertEntry, actions: AlertActions) {
  const { Box, Button } = ui
  const { reminder } = entry

  return (
    <Box flexDirection="row" columnGap={2}>
      <Button
        key={`alert-done-${reminder.id}`}
        label={`${reminder.emoji} ${doneLabelOf(reminder)}`}
        variant="primary"
        onPress={() => actions.done(reminder.id)}
      />
      <Button key={`alert-snooze-${reminder.id}`} label={`Snooze ${SNOOZE_MIN}m`} dimColor onPress={() => actions.snooze(reminder.id)} />
    </Box>
  )
}

function terminalCard(ui: AlertUi, entry: AlertEntry, actions: AlertActions) {
  const { Box, Text } = ui
  const { reminder } = entry

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={reminder.color} paddingX={2} rowGap={1}>
      <Text bold color={reminder.color}>
        {`${reminder.emoji}  ${reminder.name} is ready   ✦ · ˚ ✦ · ˚ ✦`}
      </Text>
      {words(ui, entry)}
      {buttons(ui, entry, actions)}
    </Box>
  )
}

function desktopCard(ui: AlertUi, entry: AlertEntry, actions: AlertActions, Svg: SvgElement) {
  const { Box } = ui
  const hero = heroSvg(entry.reminder)

  return (
    <Box flexDirection="column" rowGap={1}>
      <Svg source={hero.source} alt={hero.alt} width={hero.width} height={hero.height} />
      {words(ui, entry)}
      {buttons(ui, entry, actions)}
    </Box>
  )
}

export function alertPane(ui: AlertUi, entries: readonly AlertEntry[], actions: AlertActions, Svg?: SvgElement) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="column" rowGap={1}>
      {entries.length === 0 ? <Text>All caught up. Nothing is waiting for you. ✓</Text> : ''}
      {entries.map(entry => (Svg === undefined ? terminalCard(ui, entry, actions) : desktopCard(ui, entry, actions, Svg)))}
      <Button key="alert-dismiss" label={entries.length === 0 ? 'Close' : 'Dismiss'} dimColor onPress={actions.dismiss} />
    </Box>
  )
}
