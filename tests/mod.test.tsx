import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { normalize, setCheckUpdates, setEvery } from '../hooks/reminders'
import type { Snapshot } from '../types'

const MIN = 60_000
const T0 = 1_000_000

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

// What Claude Code would draw where the mod hands a site back.
const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

const SITE = { plugin: 'breaks', viewport: { columns: 100, rows: 30 } } as const

const BAND = (surface: Surface) =>
  ({
    ...SITE,
    surface,
    component: 'AbovePrompt',
    requestId: 'band',
    props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} },
  }) as const

const PANE = (requestId: string, surface: Surface = 'terminal') =>
  ({
    ...SITE,
    surface,
    component: 'Pane',
    requestId,
    props: { title: 'Breaks', isFocused: true, bodyColumns: 90, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

const SETTINGS = PANE('breaks-settings')
const ALERT = (surface: Surface) => PANE('breaks-alert', surface)

// The tests time things against these intervals, which are not the ones the mod ships with, so
// they keep their meaning when a default changes.
const fixture = (): Snapshot =>
  (
    [
      ['water', 45],
      ['eyes', 30],
      ['stretch', 60],
      ['walk', 120],
    ] as const
  ).reduce((snap, [id, minutes]) => setEvery(snap, id, minutes, T0), normalize(undefined, T0))

const runBreaks = ($: Engine, args: string) =>
  $.command.run({ command: 'breaks', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

// The engine's own answers, so the hooks can run without a session.
function stubEngine(on: On, options: { entries?: Record<string, unknown>; isPlaced?: boolean } = {}) {
  const toasts: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(options.entries ?? { data: fixture() }))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    opened.push(e.id)

    return { value: options.isPlaced === false ? { isPlaced: false as const, reason: 'narrow' as const } : { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    closed.push(e.id)

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'breaks' } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('audio.play', () => ({ value: undefined }))
  on('ui.render', () => STOCK)

  const data = () => store.get('data') as Snapshot

  return { toasts, opened, closed, clock, store, data }
}

const popups = (opened: readonly string[]) => opened.filter(id => id === 'breaks-alert').length

test('on the desktop the cooldowns are rings in one picture, a ready one opens the pop-up once, and its button starts it again', async ($, on) => {
  const { toasts, opened, clock, data } = stubEngine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount(BAND('desktop'))
  const picture = (await band.find({ type: 'Svg' })) as { props: { source: string; alt: string } } | undefined
  expect(picture?.props.alt).toContain('Water: 45m left')
  expect(picture?.props.alt).not.toContain('Medicine')
  expect(picture?.props.source).toContain('class="track"')
  // A drawing that animates replays from its start each time the host redraws the band: flicker.
  expect(picture?.props.source).not.toContain('animation')
  expect(await band.find({ key: 'done-eyes' })).toBeUndefined()
  expect(await band.find({ key: 'settings' })).toBeDefined()

  // Eyes comes every 30 minutes; a tick looks for what is due every 20 seconds.
  await clock.advance(31 * MIN)
  expect(popups(opened)).toBe(1)
  expect(toasts).toEqual([])
  expect(await band.find({ key: 'done-eyes' })).toBeDefined()

  await clock.advance(10 * MIN)
  expect(popups(opened)).toBe(1)

  await band.press({ key: 'done-eyes' })
  expect(await band.find({ key: 'done-eyes' })).toBeUndefined()
  expect(data().clocks.eyes?.since).toBeGreaterThan(T0 + 40 * MIN)
})

test('the desktop pop-up is a large picture, why it matters, a fun fact and buttons; Done starts it again and closes the pop-up', async ($, on) => {
  const { closed, clock, data } = stubEngine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(31 * MIN)

  const popup = await $.ui.mount(ALERT('desktop'))
  const hero = (await popup.find({ type: 'Svg' })) as { props: { source: string; alt: string; width: number; height: number } } | undefined
  expect(hero?.props.alt).toBe('Rest your eyes. 30 min of screen time.')
  expect(hero?.props.height).toBeGreaterThanOrEqual(150)
  expect(hero?.props.source).toContain('class="ring"')
  expect(await popup.find({ type: 'Text', text: /blink far less/ })).toBeDefined()
  expect(await popup.find({ type: 'Text', text: /Did you know\?/ })).toBeDefined()
  expect(await popup.find({ key: 'alert-snooze-eyes' })).toBeDefined()

  await popup.press({ key: 'alert-done-eyes' })
  expect(closed).toContain('breaks-alert')
  expect(data().clocks.eyes?.since).toBeGreaterThan(T0 + 30 * MIN)
})

test('the terminal pop-up is a card with the same words, and Snooze puts it off', async ($, on) => {
  const { closed, clock, data } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(31 * MIN)

  const popup = await $.ui.mount(ALERT('terminal'))
  expect(await popup.find({ type: 'Svg' })).toBeUndefined()
  expect(await popup.find({ type: 'Text', text: /Rest your eyes/ })).toBeDefined()
  expect(await popup.find({ type: 'Text', text: /blink far less/ })).toBeDefined()
  expect(await popup.find({ type: 'Text', text: /Did you know\?/ })).toBeDefined()

  await popup.press({ key: 'alert-snooze-eyes' })
  expect(closed).toContain('breaks-alert')
  // Ready again in ten minutes, not in thirty.
  const eyes = data().clocks.eyes!
  expect(T0 + 31 * MIN - eyes.since).toBeLessThan(30 * MIN)
  expect(eyes.since + 30 * MIN - (T0 + 31 * MIN)).toBeLessThanOrEqual(10 * MIN)
})

test('where there is no room for a pane the toast carries the whole pop-up', async ($, on) => {
  const { toasts, clock } = stubEngine(on, { isPlaced: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(31 * MIN)

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('👀')
  expect(toasts[0]).toContain('blink far less')
  expect(toasts[0]).toContain('Did you know?')
})

test('reminders that come due together share one pop-up with a card each', async ($, on) => {
  const { opened, clock } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  // Water and eyes both come every 45 minutes now, so they are ready on the same tick.
  await runBreaks($, 'set eyes 45')
  await clock.advance(46 * MIN)
  expect(popups(opened)).toBe(1)

  const popup = await $.ui.mount(ALERT('terminal'))
  expect(await popup.find({ key: 'alert-done-water' })).toBeDefined()
  expect(await popup.find({ key: 'alert-done-eyes' })).toBeDefined()
  await popup.press({ key: 'alert-done-water' })
  expect(await popup.find({ key: 'alert-done-water' })).toBeUndefined()
  expect(await popup.find({ key: 'alert-done-eyes' })).toBeDefined()
})

test('in the terminal the cooldowns are text, with no picture', async ($, on) => {
  const { clock } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount(BAND('terminal'))
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: /💧 /u })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /💊 /u })).toBeUndefined()

  await clock.advance(31 * MIN)
  expect(await band.find({ type: 'Text', text: /👀 /u })).toBeDefined()
  expect(await band.find({ key: 'done-eyes' })).toBeDefined()
})

test('the settings pane switches reminders on and off, changes how often they come, and turns Medicine on', async ($, on) => {
  const { data } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const pane = await $.ui.mount(SETTINGS)
  expect(await pane.find({ key: 'toggle-medicine' })).toBeDefined()
  expect(await pane.find({ key: 'done-medicine' })).toBeUndefined()

  await pane.press({ key: 'toggle-walk' })
  await pane.press({ key: 'more-water' })
  await pane.press({ key: 'toggle-medicine' })
  await pane.press({ key: 'sound' })

  const stored = data()
  expect(stored.reminders.find(reminder => reminder.id === 'walk')?.enabled).toBe(false)
  expect(stored.reminders.find(reminder => reminder.id === 'water')?.everyMin).toBe(50)
  expect(stored.reminders.find(reminder => reminder.id === 'medicine')?.enabled).toBe(true)
  expect(stored.settings.sound).toBe(false)
  expect(await pane.find({ key: 'done-walk' })).toBeUndefined()
  expect(await pane.find({ key: 'done-medicine' })).toBeDefined()
})

test('a reminder of your own is added from the pane and the prompt, shows in the band, and is deleted after a second press', async ($, on) => {
  const { toasts, data } = stubEngine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

  const pane = await $.ui.mount(SETTINGS)
  await pane.input({ key: 'add', text: '🍎 Snack 90 | Time to eat something' })
  expect(data().reminders.find(reminder => reminder.id === 'custom-snack')).toMatchObject({ emoji: '🍎', everyMin: 90, message: 'Time to eat something' })
  expect(toasts).toContain('Added 🍎 Snack. It will remind you every 90 min.')
  expect(await pane.find({ key: 'toggle-custom-snack' })).toBeDefined()

  await pane.input({ key: 'add', text: '🍎 Snack 30' })
  expect(toasts.at(-1)).toContain('already a reminder called')
  await pane.input({ key: 'add', text: '' })
  expect(toasts.at(-1)).toContain('Give it a name')

  expect((await runBreaks($, 'add 🌿 Plants 120')).text).toBe('Added 🌿 Plants. It will remind you every 120 min.')
  const band = await $.ui.mount(BAND('desktop'))
  const alt = ((await band.find({ type: 'Svg' })) as unknown as { props: { alt: string } }).props.alt
  expect(alt).toContain('Snack: 1h30 left')
  expect(alt).toContain('Plants: 2h left')

  // The first press only asks; the second deletes.
  await pane.press({ key: 'delete-custom-snack' })
  expect(data().reminders.some(reminder => reminder.id === 'custom-snack')).toBe(true)
  expect(await pane.find({ key: 'confirm-custom-snack' })).toBeDefined()
  await pane.press({ key: 'keep-custom-snack' })
  expect(await pane.find({ key: 'confirm-custom-snack' })).toBeUndefined()
  await pane.press({ key: 'delete-custom-snack' })
  await pane.press({ key: 'confirm-custom-snack' })
  expect(data().reminders.some(reminder => reminder.id === 'custom-snack')).toBe(false)
  expect(await pane.find({ key: 'toggle-custom-snack' })).toBeUndefined()
})

test('a deleted built-in reminder stays gone until it is restored', async ($, on) => {
  const { data } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const pane = await $.ui.mount(SETTINGS)
  expect(await pane.find({ key: 'restore' })).toBeUndefined()
  await pane.press({ key: 'delete-water' })
  await pane.press({ key: 'confirm-water' })
  expect(data().reminders.some(reminder => reminder.id === 'water')).toBe(false)
  expect(await pane.find({ key: 'restore' })).toBeDefined()

  await pane.press({ key: 'restore' })
  expect(data().reminders.find(reminder => reminder.id === 'water')).toMatchObject({ enabled: true, everyMin: 60 })
  expect(await pane.find({ key: 'restore' })).toBeUndefined()
})

test('/breaks sets, snoozes and pauses, and nothing comes up while it is paused', async ($, on) => {
  const { opened, clock } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect((await runBreaks($, 'set eyes 10')).text).toBe('Rest eyes will remind you every 10 min.')
  await runBreaks($, 'pause')
  await clock.advance(60 * MIN)
  expect(popups(opened)).toBe(0)

  const band = await $.ui.mount(BAND('terminal'))
  expect(await band.find({ key: 'resume' })).toBeDefined()
  await band.press({ key: 'resume' })
  await clock.advance(11 * MIN)
  expect(popups(opened)).toBe(1)
})

test('/breaks test shows a sample pop-up even when nothing is ready', async ($, on) => {
  const { opened } = stubEngine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

  await runBreaks($, 'test')
  expect(popups(opened)).toBe(1)

  const popup = await $.ui.mount(ALERT('desktop'))
  expect(((await popup.find({ type: 'Svg' })) as { props: { alt: string } } | undefined)?.props.alt).toBe('Time for some water. 45 min since your last drink.')
  expect(await popup.find({ type: 'Text', text: /Did you know\?/ })).toBeDefined()
})

test('a session that starts after a long silence starts every cooldown fresh instead of piling up pop-ups', async ($, on) => {
  const old = normalize(undefined, T0 - 600 * MIN)
  const { opened, data } = stubEngine(on, { entries: { data: old } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(data().clocks.water?.since).toBe(T0)
  expect(data().clocks.walk?.since).toBe(T0)
  expect(popups(opened)).toBe(0)
})

test('a store from the first version is moved over when the session starts, and Medicine arrives switched off', async ($, on) => {
  const old = {
    settings: { sound: true, awayMin: 20, reminders: { water: { enabled: true, everyMin: 40 }, eyes: { enabled: true, everyMin: 30 }, stretch: { enabled: true, everyMin: 60 }, walk: { enabled: false, everyMin: 120 } } },
    clocks: { water: { since: T0, firedFor: -1 }, eyes: { since: T0, firedFor: -1 }, stretch: { since: T0, firedFor: -1 }, walk: { since: T0, firedFor: -1 } },
    pausedAt: null,
    lastActiveAt: T0,
  }
  const { data } = stubEngine(on, { entries: { data: old } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(data().reminders.map(reminder => reminder.id)).toEqual(['water', 'eyes', 'stretch', 'walk', 'medicine'])
  expect(data().reminders.find(reminder => reminder.id === 'water')?.everyMin).toBe(40)
  expect(data().reminders.find(reminder => reminder.id === 'walk')?.enabled).toBe(false)
  expect(data().reminders.find(reminder => reminder.id === 'medicine')?.enabled).toBe(false)
})

test('with every reminder off the band is left to whoever else draws there', async ($, on) => {
  stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  for (const name of ['water', 'eyes', 'stretch', 'walk']) {
    await runBreaks($, `off ${name}`)
  }

  const band = await $.ui.mount(BAND('terminal'))
  expect(await band.find({ type: 'Text', text: 'stock row' })).toBeDefined()
  expect(await band.find({ key: 'settings' })).toBeUndefined()
})

test('/breaks defaults moves the built-in reminders to the recommended intervals', async ($, on) => {
  const { data } = stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect((await runBreaks($, 'defaults')).text).toBe('Recommended intervals set (minutes): Water 60, Rest eyes 20, Stretch 30, Walk 60.')
  expect(data().reminders.map(reminder => reminder.everyMin)).toEqual([60, 20, 30, 60, 480])
})

test('a first run with nothing stored uses the recommended intervals', async ($, on) => {
  const { data } = stubEngine(on, { entries: {} })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(data().reminders.map(reminder => reminder.everyMin)).toEqual([60, 20, 30, 60, 480])
})

// A store whose last look was long enough ago for the weekly look to be due.
const weeklyLook = (): Snapshot => {
  const snap = setCheckUpdates(fixture(), true)

  return { ...snap, update: { ...snap.update, checkedAt: T0 - 8 * 24 * 60 * MIN } }
}

// What the fetch tool answers, so the update check can run without the network.
function stubGitHub(on: On, version: string) {
  const fetched: string[] = []

  on('tool.call', { tool: 'WebFetch' }, (_$, e) => {
    fetched.push(String(e.url))

    return { result: { bytes: 1, code: 200, codeText: 'OK', result: version, durationMs: 1 } } as never
  })

  return fetched
}

test('with the weekly look on, a newer version is announced once, and not looked for again within the week', async ($, on) => {
  const fetched = stubGitHub(on, 'version 9.0.0')
  const { toasts, clock, data, store } = stubEngine(on, { entries: { data: weeklyLook() } })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)

  expect(fetched).toEqual(['https://raw.githubusercontent.com/VladGirboan/claude-breaks/main/.claude-plugin/plugin.json'])
  expect(data().update.latest).toBe('9.0.0')
  expect(toasts.filter(text => text.includes('breaks 9.0.0 is out'))).toHaveLength(1)
  expect(toasts.find(text => text.includes('breaks 9.0.0 is out'))).toContain('/plugin marketplace update')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  expect(fetched).toHaveLength(1)

  store.set('data', { ...data(), update: { ...data().update, checkedAt: T0 - 8 * 24 * 60 * MIN } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  expect(fetched).toHaveLength(2)
  expect(toasts.filter(text => text.includes('breaks 9.0.0 is out'))).toHaveLength(1)
})

test('nothing is looked up unless the person turned the weekly look on; /breaks update looks when asked', async ($, on) => {
  const fetched = stubGitHub(on, '0.1.0')
  const { clock } = stubEngine(on)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  expect(fetched).toHaveLength(0)

  expect((await runBreaks($, 'update')).text).toContain('You have the latest version')
  expect(fetched).toHaveLength(1)
})

test('when GitHub cannot be read, /breaks update says so instead of guessing', async ($, on) => {
  stubGitHub(on, 'the page was empty')
  stubEngine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect((await runBreaks($, 'update')).text).toContain('could not read the latest version')
})
