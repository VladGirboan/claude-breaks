import type { ElementTable } from 'claude-code'

import { cooldownSvg } from './art'
import { doneLabelOf, formatLeft, glyphFor } from './reminders'
import type { Item } from './reminders'

// The row above the prompt: the enabled reminders as cooldowns, the ones that are ready as
// buttons that start them again, and a gear that opens the settings.

export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button'>

// The vector element, on the surfaces that have one (the desktop app).
export type SvgElement = ElementTable<'desktop'>['Svg']

export type BandActions = {
  done: (id: string) => void
  resume: () => void
  open: () => void
}

// How many cooldowns and Done buttons the row has room for; the rest are counted.
const SHOWN = 6
const BUTTONS = 3

function terminalCooldowns(ui: Ui, items: readonly Item[], isPaused: boolean) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" columnGap={2}>
      {items.map(item => (
        <Text dimColor={isPaused}>
          {`${item.reminder.emoji} `}
          <Text color={item.reminder.color}>{glyphFor(item.charge)}</Text>
          {` ${formatLeft(item.charge.leftMs)}`}
        </Text>
      ))}
    </Box>
  )
}

export function bandRow(ui: Ui, items: readonly Item[], isPaused: boolean, actions: BandActions, Svg?: SvgElement) {
  const { Box, Text, Button } = ui
  const shown = items.slice(0, SHOWN)
  const ready = items.filter(item => item.charge.isReady)
  const built = Svg === undefined ? undefined : cooldownSvg(shown, isPaused)

  return (
    // The right edge stays clear: the band draws its own collapse mark ([-]) there.
    <Box flexDirection="row" alignItems="center" columnGap={2} paddingRight={5}>
      {Svg !== undefined && built !== undefined ? (
        <Svg source={built.source} alt={built.alt} width={built.width} height={built.height} />
      ) : (
        terminalCooldowns(ui, shown, isPaused)
      )}
      {items.length > SHOWN ? <Text dimColor>{`+${items.length - SHOWN}`}</Text> : ''}
      <Box flexGrow={1} />
      {isPaused ? <Text dimColor>paused</Text> : ''}
      {isPaused ? (
        <Button key="resume" label="Resume" variant="primary" onPress={actions.resume} />
      ) : (
        ready.slice(0, BUTTONS).map(item => (
          <Button
            key={`done-${item.reminder.id}`}
            label={`${item.reminder.emoji} ${doneLabelOf(item.reminder)}`}
            variant="primary"
            onPress={() => actions.done(item.reminder.id)}
          />
        ))
      )}
      {!isPaused && ready.length > BUTTONS ? <Text dimColor>{`+${ready.length - BUTTONS} ready`}</Text> : ''}
      <Button key="settings" label="⚙" plain dimColor onPress={actions.open} />
    </Box>
  )
}
