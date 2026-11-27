# Pilot 01: "The End of the Pier"

This is a visual proof of concept for the final direction (Option B): the Traveller stick figure, animated in code, inside painted cinematic environments. It covers the opening line only. The narration is the original recording, unedited:

> "Have you ever looked at your life… and wondered how you ended up here?"

**Length:** 9.0 s · 1920×1080 · 30 fps.
**Renders:** `out/pilot01/` (rebuild with `bash scripts/pilot/render_pilot01.sh`).
**Source:** `src/pilot/Pilot01.tsx`.

This is a new environment. Nothing is reused from V1/V2: no crossroads, no map, no olive tree, and no detailed protagonist.

## Shots

| | Shot 1: medium, 0.0–3.1 s | Shot 2: high extreme wide, 3.1–9.0 s |
|---|---|---|
| **Narration** | "Have you ever looked at your life…" | "…and wondered how you ended up here?" |
| **Image** | The Traveller stands at the end of a wooden pier at night. One lamp burns beside him. Mist lies on a still lake with mountains reflected in it. | The whole pier seen from the shore: a long boardwalk running out into the mist, with him as a small figure at the very end under the only light. |
| **Action** | Breathing and a small weight shift. On "looked at your life…" his head and shoulders lower toward the water. | Seen from behind. On "here" he turns and looks back over his shoulder toward the shore, back along the way he came. |
| **Camera** | A slow push-in. Each layer moves at its own rate: sky and mountains, mist, pier and figure, and the defocused foreground mooring post. | Crane-up and pull-back. The reveal widens to show how far he has walked. Reeds in the near foreground pass out of frame. |
| **Light** | The warm lamp is the key; the moonless night is a cool ambient. Lamp flicker, moths in the light, a warm rim on the lamp-facing edges, a cast shadow on the planks. | The light is behind him, so he is a backlit silhouette with a warm edge. The lamp's pool spreads on the boards, with his shadow falling toward camera. |
| **Cut** | The cut lands in the narrator's own pause after "life…". | It holds about 3 s on the reveal, then fades out. |
| **Metaphor** | Standing at the edge: as far as the path goes. | The long road behind him: "how you ended up here" is the length of that pier. |
| **Sound** | The original voice; night-lake lapping and a light breeze, lowered under the voice. | Same. |

## How the painted backgrounds were made (honest disclosure)

**No illustrator and no AI image generator was used.** No image-generation service is reachable from this environment. The plates are painted procedurally by `scripts/pilot/paint_plates_pilot01.py`, which works in two steps:

1. It composes an under-painting: sky gradients, ridges, water reflections, the pier in true perspective, and the lamp.
2. A stroke-based painting renderer repaints that under-painting with layered brush strokes that follow the image's own contours, large brushes first and small ones last. A canvas-tooth texture finishes the surface.

Each shot is split into 5 layers (far, mist, pier, glow, foreground) at 2560×1440, which gives the camera room to move.

If you later commission painted backgrounds from an illustrator or a generator, they drop straight into the same layers: one PNG per depth layer. The animation, lighting, camera and subtitles do not change.

## Making the character part of the world

- **Ambient light.** The figure's base colour is darkened and cooled to the night ambient light.
- **Lamp key.** A warm key falls off with distance from the lamp. Only the half of each limb that faces the lamp catches it, with a soft terminator.
- **Rim and form shadow.** A warm rim sits on the lamp-facing edges, and the form shadow on the head is on the side away from the light.
- **Shadows.** A contact shadow sits under the feet, and a soft cast shadow falls on the boards away from the lamp.
- **Matched softness.** A slight softening matches the figure's edges to the painting.
- **Shared surface.** A light paint pass (`scripts/paint_pass.py --light`) runs over the whole frame. The figure and the world then share one brush and grain texture and the same halation.

## Subtitles

- There are two separate tracks, delivered as both overlay layers and SRT files. English uses Inter 500. Arabic uses IBM Plex Sans Arabic 500, set right-to-left with connected letterforms.
- The text is soft ivory (`#F4EFE6`) with a subtle shadow and no box. The position is fixed at the bottom, with gentle 7–8 frame fades and no animation.
- Cue times come from word-level timestamps of the recording. Each cue starts 2 frames before the first word and ends about 0.5 s after the last.
- The Arabic text is a translation preview for approval. It is not a final localisation.

## Known limitations

- The plates are code-painted. They read as painterly, but not at the level of a hand-painted matte painting: water and mist are strong, while the hard-edged structures (pier edges, lamp post) are simpler.
- The figure is lit by a 2D lighting model, not a 3D one. It holds up at these angles, but a full 3D turn would need hand-tuned light per pose.
- There is no music, as required for this stage.
