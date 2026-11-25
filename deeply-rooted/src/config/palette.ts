// Approved Deeply Rooted palette (Phase 01 brief). Every colour in the film is either one of
// these seven or mixed from them in `tones` below.
export const palette = {
  ivory: '#F2EDE3', // warm ivory
  beige: '#C8B9A5', // muted beige
  charcoal: '#303238', // deep charcoal
  mist: '#8D969B', // misty gray
  olive: '#747D58', // olive green
  brown: '#806854', // muted brown
  gold: '#D9B77D', // soft golden light
} as const;

// Production tones derived from the palette (character, props, environment).
export const tones = {
  // --- The Walker (locked character colours) ---
  skin: '#9A7259',
  skinShadow: '#7B5646',
  skinDeep: '#62443A',
  skinLight: '#B38A6D',
  lip: '#7F5547',
  hair: '#352A25',
  hairLight: '#5A4639',
  eyeWhite: '#DCD3C6',
  iris: '#3A2A22',
  coat: palette.charcoal,
  coatShadow: '#232429',
  coatLight: '#464951',
  sweater: '#E2D8C6',
  sweaterShadow: '#BFB29D',
  trousers: '#57463A',
  trousersShadow: '#41352E',
  boots: '#97714F',
  bootsShadow: '#6F523C',
  bootsLight: '#B48D69',
  sole: '#34292A',
  satchel: '#B8A78A',
  satchelShadow: '#8F7F66',
  // --- Paper map ---
  paper: '#EEE6D4',
  paperBack: '#D9CFBC',
  ink: '#4B3C31',
  inkFaded: '#7C6A5A',
  // --- Olive tree ---
  bark: '#5E5449',
  barkLight: '#857868',
  leafDark: '#5B6249',
  leaf: palette.olive,
  leafSilver: '#A3A890',
} as const;

export type Palette = typeof palette;
