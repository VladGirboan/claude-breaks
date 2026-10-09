// The built-in reminders: their wording, why each matters, the fun facts the pop-up draws from,
// and the interval each comes at by default. Content only. Every fact and every default was
// checked against the source named in the comment beside it (see "Where the defaults come from"
// in the README). The medicine reminder points to the label and never advises on a dose.

export type Template = {
  id: string
  name: string
  // Names this reminder went by before, so a store that saved one is moved to the current name.
  formerNames?: readonly string[]
  emoji: string
  color: string
  // The pop-up's headline, and what the interval counts ("20 min" + "of screen time").
  headline: string
  since: string
  // The button that says it is done once the reminder is due.
  doneLabel: string
  defaultEveryMin: number
  defaultEnabled: boolean
  resetOnAway: boolean
  // The toast's line when the pop-up cannot be shown. It changes on each cycle.
  messages: readonly string[]
  // Why the break matters, in a sentence or two.
  why: string
  facts: readonly string[]
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'water',
    name: 'Water',
    emoji: '💧',
    color: '#4fb3e8',
    headline: 'Time for some water',
    since: 'since your last drink',
    doneLabel: 'Drank',
    // A glass an hour over a working day is about 8 cups: the 9 to 13 cups of fluid a day that
    // Cleveland Clinic gives as a starting point, less what you drink away from your desk.
    defaultEveryMin: 60,
    defaultEnabled: true,
    resetOnAway: false,
    messages: [
      'Time for some water. 💧',
      'A glass of water is waiting for you. 💧',
      'Grab a drink while Claude works. 💧',
    ],
    why: 'Even mild dehydration can bring on headaches, tiredness and trouble focusing. Small, regular sips are an easy way to keep up.',
    facts: [
      // USGS Water Science School, citing Mitchell et al., J Biol Chem, 1945.
      'Your brain and heart are about 73% water, according to the US Geological Survey.',
      // USGS: "Up to 60% of the human adult body is water."
      'Up to 60% of an adult’s body is water, according to the US Geological Survey.',
      // Cleveland Clinic: milk, tea, coffee and juices count toward your daily fluid goal.
      'Coffee and tea count toward your fluid for the day, though water is still the best default.',
      // Cleveland Clinic, citing the Academy of Nutrition and Dietetics: about 9 cups (women), 13 cups (men).
      'A common starting point is about 9 cups of fluid a day for women and 13 for men, from everything you drink.',
      // Hydration Status in Older Adults, PMC10255140: thirst perception tends to decline with age.
      'Thirst is a good guide for most people, but it is easy to tune out when you are absorbed in work, and it gets less reliable with age.',
      'A walk to refill your glass doubles as a tiny stretch break.',
    ],
  },
  {
    id: 'eyes',
    name: 'Rest eyes',
    formerNames: ['Eyes'],
    emoji: '👀',
    color: '#f2c14e',
    headline: 'Rest your eyes',
    since: 'of screen time',
    doneLabel: 'Looked away',
    // The American Optometric Association's 20-20-20 rule: every 20 minutes, 20 seconds, 20 feet.
    defaultEveryMin: 20,
    defaultEnabled: true,
    resetOnAway: true,
    messages: [
      'Rest your eyes: look at something 20 feet away for 20 seconds. 👀',
      'Look away from the screen for a moment. A window is perfect. 👀',
    ],
    why: 'We blink far less when we stare at a screen, which can leave eyes dry, blurry and achy. Looking into the distance gives them a rest.',
    facts: [
      // American Optometric Association, Computer Vision Syndrome page.
      'The 20-20-20 rule from the American Optometric Association: every 20 minutes, look at something 20 feet away for 20 seconds.',
      // American Academy of Ophthalmology, computer usage page: about 15 blinks a minute, 5 to 7 at a screen.
      'People normally blink about 15 times a minute, but only about 5 to 7 times a minute at a screen, says the American Academy of Ophthalmology.',
      // AOA: blinking keeps the front surface of the eye moist; blink often to lower the risk of dry eye.
      'Each blink keeps the front of your eye moist. Blinking often is the American Optometric Association’s simplest tip against dry eyes at a computer.',
      // AOA: rest the eyes for 15 minutes after two hours of continuous computer use.
      'For longer sessions the American Optometric Association also suggests resting your eyes for 15 minutes after two hours of continuous screen use.',
      'Close-up work keeps a small focusing muscle in your eye busy, and looking far away lets it relax.',
    ],
  },
  {
    id: 'stretch',
    name: 'Stretch',
    emoji: '🧘',
    color: '#b794f4',
    headline: 'Time to stretch',
    since: 'since you last moved',
    doneLabel: 'Stretched',
    // Ergonomics guidance: a micro-break under two minutes, with a longer break every 30 to 60
    // minutes (University of Maryland, Environmental Safety). Every 30 sits at the short end.
    defaultEveryMin: 30,
    defaultEnabled: true,
    resetOnAway: true,
    messages: [
      'Time to stretch: roll your shoulders and reach up high. 🧘',
      'Drop your shoulders, unclench your jaw, stretch your neck. 🧘',
    ],
    why: 'Sitting still for long stretches leaves the neck, shoulders and hips stiff. A short stretch or a stand-up is an easy reset.',
    facts: [
      // University of Maryland Environmental Safety: a micro-break is less than two minutes.
      'Ergonomics guidance counts a break of under two minutes as a micro-break: stand, stretch, rest your hands.',
      // The same page: every 30 to 60 minutes, take a brief break.
      'The University of Maryland’s ergonomics advice is a brief break every 30 to 60 minutes.',
      'Quick check: are your shoulders up near your ears? Drop them.',
      'Reaching both arms overhead and taking one slow breath is a ten-second stretch break.',
    ],
  },
  {
    id: 'walk',
    name: 'Walk',
    emoji: '🚶',
    color: '#6fcf97',
    headline: 'Time for a walk',
    since: 'since you last walked',
    doneLabel: 'Walked',
    // A few minutes of light walking each hour. Studies of breaking up sitting used 3 to 5
    // minutes every 30 minutes (Wennberg 2016; Diaz 2023); an hour is the practical compromise.
    defaultEveryMin: 60,
    defaultEnabled: true,
    resetOnAway: true,
    messages: [
      'Time for a walk. Even a lap around the room counts. 🚶',
      'Stand up and move while Claude works. 🚶',
    ],
    why: 'Walking gets your blood moving and breaks up long stretches of sitting. Even a few minutes counts.',
    facts: [
      // Oppezzo & Schwartz, J Exp Psychol: Learn Mem Cogn, 2014; Stanford: about twice as many creative responses.
      'In a Stanford study of 176 people, walkers came up with about twice as many creative ideas as people sitting, even on a treadmill facing a blank wall. It did not help focused, single-answer thinking.',
      // Wennberg et al., BMJ Open, 2016: 19 adults, 3-minute light walks every 30 minutes, less fatigue.
      'In a small 2016 study of 19 adults, a 3-minute light walk every 30 minutes left people less tired than sitting without a break.',
      // Diaz et al., Medicine & Science in Sports & Exercise, 2023: 11 adults, 5 minutes every 30.
      'In a small Columbia University study of 11 adults, a 5-minute light walk every 30 minutes of sitting lowered the blood sugar rise after a meal.',
      // Marshall et al., Am J Prev Med, 2009: about 100 steps a minute is a moderate pace.
      'A moderate walking pace is about 100 steps a minute, so ten minutes is around 1,000 steps.',
      'Your calf muscles squeeze the veins in your lower legs with every step, helping push blood back toward your heart. People call them your second heart.',
    ],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    emoji: '💊',
    color: '#f28b82',
    headline: 'Time for your medicine',
    since: 'since your last dose',
    doneLabel: 'Took it',
    // There is no recommended interval: it is whatever the label or the prescriber says. Eight
    // hours is a placeholder, and the reminder ships switched off.
    defaultEveryMin: 480,
    defaultEnabled: false,
    resetOnAway: false,
    messages: [
      'Medicine time. Check your label, then take your dose. 💊',
      'Time for your medicine. 💊',
    ],
    why: 'Medicines work best when taken the way the label or your prescriber says, and it is easy to forget when you are deep in work. This is a reminder, not medical advice, and it does not know your dose.',
    facts: [
      // MedlinePlus (lisinopril label): take it around the same time every day to help you remember.
      'Many medicine labels say to take it at about the same time each day, partly to help you remember it.',
      // Habit-formation research on medication adherence: anchor the dose to a stable daily routine.
      'Tying a dose to something you already do every day, like brushing your teeth, is a well-studied way to remember it.',
      // NHS (finasteride): set an alarm, and ask your pharmacist about other ways to remember.
      'The NHS suggests an alarm for people who forget doses, and a pharmacist can suggest other ways to remember.',
      // MedlinePlus and NHS: do not take a double dose to make up for a missed one.
      'If you miss a dose, check the leaflet or ask a pharmacist, and do not take a double dose to catch up unless a prescriber tells you to.',
    ],
  },
]

export const templateOf = (id: string): Template | undefined => TEMPLATES.find(template => template.id === id)

// Colors handed to reminders people add, in turn.
export const CUSTOM_COLORS: readonly string[] = ['#f2994a', '#56ccf2', '#bb6bd9', '#27ae60', '#eb5757', '#2d9cdb', '#e0a458', '#9b51e0']
