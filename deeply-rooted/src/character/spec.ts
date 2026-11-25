/**
 * MASTER CHARACTER LOCK — "The Walker"
 * Approved: adult male, late twenties. One asset for the whole film: every scene renders these
 * exact shapes, proportions and colours. Views are drawn from the same landmark table below,
 * so the character cannot drift or morph between shots.
 *
 * Units: centimetres, y-up, origin on the ground between the feet.
 */
import {tones} from '../config/palette';

export const WALKER = {
  name: 'The Walker',
  age: 'late 20s',
  height: 178, // cm, ~7.6 heads tall
  headHeight: 23.5,
  landmarks: {
    crown: 179.4,
    hairTop: 181.2,
    brow: 169.2,
    eyes: 166.7,
    noseTip: 162.5,
    mouth: 159.8,
    chin: 155.0,
    shoulders: 146.5,
    chest: 130,
    elbow: 113,
    waist: 104,
    wrist: 86.5,
    hip: 88,
    coatHem: 52, // knee-length overcoat
    knee: 50,
    bootTop: 12,
  },
  build: 'slim, medium height, narrow waist, relaxed slightly rounded shoulders',
  face: 'oval-long face, defined straight jaw, straight medium nose, calm dark-brown eyes, straight brows, light stubble',
  hair: 'short dark-brown hair, soft tousled top swept toward his right, short sides, small sideburns',
  wardrobe: {
    coat: {colour: tones.coat, note: 'knee-length charcoal wool overcoat, notched lapels, worn open'},
    sweater: {colour: tones.sweater, note: 'cream knit crew-neck sweater with fine vertical rib'},
    trousers: {colour: tones.trousers, note: 'dark-brown straight trousers, slight break over boots'},
    boots: {colour: tones.boots, note: 'worn tan leather ankle boots, dark soles'},
    satchel: {colour: tones.satchel, note: 'faded beige canvas satchel, strap from his left shoulder to right hip'},
    prop: {colour: tones.paper, note: 'aged ivory paper map, folded in 3 × 2 panels'},
  },
  skin: {base: tones.skin, shadow: tones.skinShadow, light: tones.skinLight, note: 'warm olive-brown, deliberately hard to place ethnically'},
  acting: 'restrained: emotion through posture, breath, gaze and hands; no big expressions, no lip-sync',
} as const;

export type Mode = 'color' | 'white' | 'black';
/** Paint helper: the same shapes render as colour art, or as a white/black silhouette for masks. */
export const paint = (mode: Mode, c: string) => (mode === 'color' ? c : mode === 'white' ? '#fff' : '#000');
