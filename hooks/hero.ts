import type { Reminder } from '../types'
import { escapeXml } from './art'

// The desktop pop-up's picture: a wide banner in the reminder's color, with its emoji large on
// the left inside rings that ripple outward, the headline beside it, and bubbles (for water) or
// sparkles drifting across. One SVG, drawn from the reminder alone, so every reminder gets one.

const WIDTH = 540
const HEIGHT = 150

const STYLE = [
  // The drawing cannot see the app's theme, so it follows the system's.
  '.h{fill:#202124;font:700 27px system-ui,sans-serif}.s{fill:#5f6368;font:14px system-ui,sans-serif}',
  '@media (prefers-color-scheme:dark){.h{fill:#f1f3f4}.s{fill:#b4bac0}}',
  '.ring{transform-box:fill-box;transform-origin:center;animation:ripple 2.6s ease-out infinite}',
  '@keyframes ripple{from{transform:scale(1);opacity:.65}to{transform:scale(1.9);opacity:0}}',
  '.sp{transform-box:fill-box;transform-origin:center;animation:twinkle 2.4s ease-in-out infinite}',
  '@keyframes twinkle{0%,100%{opacity:.1;transform:scale(.5)}50%{opacity:.95;transform:scale(1.15)}}',
  '.bub{animation:rise 3.2s ease-in infinite}',
  '@keyframes rise{from{transform:translateY(26px);opacity:0}30%{opacity:.8}to{transform:translateY(-38px);opacity:0}}',
  '.pop{transform-box:fill-box;transform-origin:center;animation:pop .7s cubic-bezier(.2,1.4,.4,1)}',
  '@keyframes pop{from{transform:scale(.3);opacity:0}}',
  '@media (prefers-reduced-motion:reduce){.ring,.sp,.bub,.pop{animation:none}.ring{opacity:.25}}',
].join('')

// A small repeatable sequence from a name, so a reminder's picture is the same each time.
function sequence(seed: string): () => number {
  let state = 2166136261

  for (const char of seed) {
    state = Math.imul(state ^ char.codePointAt(0)!, 16777619)
  }

  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507)
    state = Math.imul(state ^ (state >>> 13), 3266489909)

    return ((state ^= state >>> 16) >>> 0) / 4294967296
  }
}

const SPARKLE = 'M0 -7L1.8 -1.8L7 0L1.8 1.8L0 7L-1.8 1.8L-7 0L-1.8 -1.8Z'

export const everyText = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`

export function heroSvg(reminder: Reminder): { source: string; width: number; height: number; alt: string } {
  const color = reminder.color
  const next = sequence(reminder.id)
  const isWater = reminder.id === 'water'
  const bits: string[] = []

  for (let i = 0; i < 16; i += 1) {
    const x = 400 + next() * 118
    const y = 24 + next() * 100
    const delay = (next() * 3).toFixed(2)
    const size = 0.6 + next() * 0.9

    bits.push(
      isWater
        ? `<g transform="translate(${x.toFixed(1)} ${(y + 20).toFixed(1)})"><circle class="bub" r="${(2 + size * 3).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.5" style="animation-delay:${delay}s"/></g>`
        : `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${size.toFixed(2)})"><path class="sp" d="${SPARKLE}" fill="${color}" style="animation-delay:${delay}s"/></g>`,
    )
  }

  const rings = [0, 1.3]
    .map(delay => `<circle class="ring" r="36" fill="none" stroke="${color}" stroke-width="2" style="animation-delay:${delay}s"/>`)
    .join('')

  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><style>${STYLE}</style>`,
    `<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".34"/><stop offset="1" stop-color="${color}" stop-opacity=".05"/></linearGradient></defs>`,
    `<rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="20" fill="url(#g)" stroke="${color}" stroke-opacity=".45" stroke-width="1.5"/>`,
    bits.join(''),
    `<g transform="translate(88 75)">${rings}<circle r="44" fill="${color}" fill-opacity=".2"/><text class="pop" y="4" font-size="54" text-anchor="middle" dominant-baseline="central">${escapeXml(reminder.emoji)}</text></g>`,
    `<text class="h" x="168" y="70">${escapeXml(reminder.name)} is ready</text>`,
    `<text class="s" x="168" y="98">fully charged after ${everyText(reminder.everyMin)}</text>`,
    '</svg>',
  ].join('')

  return { source, width: WIDTH, height: HEIGHT, alt: `${reminder.name} is ready` }
}
