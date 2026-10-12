import { formatLeft } from './reminders'
import type { Item } from './reminders'

// The desktop's cooldown icons: a ring that charges clockwise around the reminder's emoji,
// with the time left beside it. A ring that is due has a halo. One SVG for the whole row.

// Names and emoji can be a person's own, so they are escaped before they go into markup.
export const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const R = 11
const ITEM_W = 98
const HEIGHT = 32
const CIRCUMFERENCE = 2 * Math.PI * R

const STYLE = [
  // The drawing cannot see the app's theme, so it follows the system's.
  '.t{fill:#5f6368;font:12px system-ui,sans-serif}.track{stroke:#808080;stroke-opacity:.3}',
  '@media (prefers-color-scheme:dark){.t{fill:#b4bac0}}',
  // No animation: the band is drawn again whenever the host redraws it (about once a second while
  // Claude works), and a drawing that animates replays from its start each time, which flickers.
].join('')

export function cooldownSvg(items: readonly Item[], isPaused: boolean): { source: string; width: number; height: number; alt: string } {
  const width = Math.max(1, items.length * ITEM_W)
  const parts = items.map((item, i) => {
    const cx = i * ITEM_W + R + 4
    const cy = HEIGHT / 2
    const filled = CIRCUMFERENCE * item.charge.fraction
    const color = item.reminder.color
    const label = formatLeft(item.charge.leftMs)

    return [
      item.charge.isReady && !isPaused ? `<circle class="halo" stroke-opacity=".5" cx="${cx}" cy="${cy}" r="${R + 3}" fill="none" stroke="${color}" stroke-width="2"/>` : '',
      `<circle class="track" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke-width="3"/>`,
      // A ring at zero draws nothing: a round cap on no length would still show a dot.
      item.charge.fraction === 0
        ? ''
        : `<circle class="arc" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${filled} ${CIRCUMFERENCE}" transform="rotate(-90 ${cx} ${cy})" opacity="${isPaused ? 0.45 : 1}"/>`,
      `<text x="${cx}" y="${cy + 0.5}" font-size="11" text-anchor="middle" dominant-baseline="central">${escapeXml(item.reminder.emoji)}</text>`,
      `<text class="t" x="${cx + R + 8}" y="${cy + 4}"${item.charge.isReady ? ` style="fill:${color};font-weight:600"` : ''}>${label}</text>`,
    ].join('')
  })

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}"><style>${STYLE}</style>${parts.join('')}</svg>`,
    width,
    height: HEIGHT,
    alt: items.map(item => `${item.reminder.name}: ${item.charge.isReady ? 'due now' : `${formatLeft(item.charge.leftMs)} left`}`).join(', '),
  }
}
