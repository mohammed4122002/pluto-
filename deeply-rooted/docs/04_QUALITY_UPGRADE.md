# Phase 01 — Cinematic Quality Upgrade (v2)

This upgrade improves the existing project rather than rebuilding it. Unchanged:
- the protagonist's identity, clothing, hair and proportions;
- the narrator's recording and its word-level sync;
- the map, olive tree, crossroads and imagined-future metaphors;
- the editable audio and animation architecture.

## What was possible, and what wasn't

- **No image-generation service was usable.** The model APIs I could reach either refused this environment (OpenAI, Stability, Replicate) or needed an API key that isn't configured (Google Gemini). A Google Cloud credential exists here, but using it to generate images would spend money on a cloud account nobody authorised for that, so it wasn't touched. Nothing in this version was produced by an AI image model.
- **So the upgrade is a hybrid painterly pipeline built from what *is* available:**
  1. Richer procedural art: painted textures, materials, volume shading and more organic detail.
  2. A painterly finishing pass on every frame (`scripts/paint_pass.py`, OpenCV). It runs a soft generalised Kuwahara filter at two scales, the classic edge-preserving oil/gouache technique, then adds pigment pooling at edges, canvas tooth, warm halation and film grain. It's deterministic per pixel, so it stays stable over time.

## Visual improvements

| Area | Before | Now |
|---|---|---|
| Overall look | Flat vector fills, perfect gradients | Gouache/oil brush patches, pigment edges, canvas tooth, halation, grain applied after painting |
| Skies | Smooth gradient + noise clouds | Stroke-painted skies (`sky_present.jpg`, `sky_imagined.jpg`) with visible brushwork |
| Hills | Flat bands with a faint texture | Brush-stroke texture laid into every ridge, stronger atmospheric layering |
| Ground | Blurred colour patches | 800–900 world-anchored brush dabs per world (they don't slide when the camera moves) |
| Vegetation | One kind of grass tuft | Grasses, **seed-head grasses**, **flowering grasses** (imagined), **shrubs**, **path stones**; tall seed-grasses frame the wide and imagined shots in the foreground |
| Olive tree | Blob canopy | Fuller canopy with about twice as many individual leaves and softer highlights |
| Face | Simple shapes | Modelled planes (brow ridge, sockets, cheekbone, nasolabial fold, under-lip, chin); layered eyes (iris gradient, lids that cover the eye, crease, lashes, waterline, tear duct, two catchlights); hair-stroke brows; sculpted lips; stubble stipple; ear anatomy |
| Hair | Solid shape + a few lines | About 60 directional strands, a darker underlayer, rim-lit top, flyaway strands moving in the wind |
| Clothing | Flat fills | Per-material textures that move with the body: wool coat, knit sweater, twill trousers, leather boots, canvas satchel; painterly stroke layer and volume shading per garment; horn buttons, pocket flap, shoulder and armhole seams, lapel edge light and the shadow it casts on the sweater |
| Shadows | — | Contact shadow under his feet; long backlit shadow in the imagined world |

## Animation improvements

All of these are driven from `src/scenes/performance.ts` and stay restrained:
- **Weight shift:** a slow 7-second sway between his feet. The upper body drifts while the boots stay planted and the legs shear naturally.
- **Coat follow-through:** the hem lags behind the body's movement, as wool does.
- **Eyes:** natural saccades (small 3-frame hops to new targets every ~0.9 s) with micro-drift, and blinks that coincide with big gaze changes.
- **Head:** micro-movement on top of the acted turns and looks.
- **Hands and map:** his thumbs re-grip the paper while he reads, and the map sinks slightly when his attention leaves it ("this isn't where…").
- **Walk cycle:** the knee lifts on the swing leg, the heel rolls to show the sole on toe-off, the forward-swinging arm bends at the elbow, and the coat swings. The back view now uses the same wool and fabric materials.

## Cinematic direction

The title sequence delayed the hook by 7.7 s, so the opening was re-cut:

| Time | Shot | Narration |
|---|---|---|
| 0.0 s | Close-up of his face in the drifting mist (fade from charcoal in 0.4 s) | — |
| 0.8 s | — | "Have you ever looked at your life… and wondered how you ended up here?" |
| on "here" (5.3 s) | Cut to the wide crossroads (the reveal) | — |
| over the wide | Title card in the sky | Her title read "When Life Doesn't Go as Planned · Deeply Rooted · Episode One" |
| Scene 02 | Medium shot (unfold), then a **close-up reaction** as his eyes leave the map, then back to the medium where focus racks to the paths behind him | "…this isn't where you thought you would be." on the close-up |
| Ending | Close-up of him lifting his eyes in the mist | — |

Framing now covers close-ups, medium shots, wide shots, a POV insert and environmental foreground detail.

**Map → landscape is now a staged transformation:**
1. Warm light glows *through* the paper and the imagined world shows faintly behind it.
2. The wash opens outward from the drawn route with a luminous wet edge, while the ink line swells like spreading pigment.
3. The remaining paper drifts forward with the camera, which keeps moving into the world.

## Subtitles

- **Typefaces:** bundled Inter Medium for captions and Cormorant Garamond for the title, loaded with the project, not system fonts.
- **Size and layout:** 56 px at 1080p (mobile-first), at most two balanced lines (`text-wrap: balance`, 1320 px max width), title-safe bottom margin.
- **Contrast:** a soft feathered charcoal plate behind the text, so it stays readable on the bright paper and sky.
- **Motion:** 8–9 frame fades only, no motion or karaoke effects.
- **Separately editable:**
  - rendered as its own transparent layer (`out/v2_subtitles_overlay.mov`, ProRes 4444);
  - delivered as SRT (`docs/phase01_captions.srt`);
  - the clean, subtitle-free master is `out/phase01_v2_clean.mp4`;
  - the source is `src/post/Captions.tsx` with timing in `src/data/narration.json`.

## Sound

- **Her voice is unchanged:** same recording, same word timing, still the centrepiece. Effects never compete with it, because ambience and effects **duck 5 dB under her voice** (sidechain-style, from the caption timing).
- **Removed the artificial transition sounds** (the bell "shimmer" and synthetic whooshes). In their place:
  - natural wind gusts through grass for the reveal, the mist and the return;
  - a warm breeze swell with leaves and arriving birds as the map becomes a world.
- **Birdsong** is rebuilt from smooth pitch contours with vibrato (falling whistles, slurs, short trills), placed in the distance with reverb, and sparser.
- **Footsteps** on the dirt path are softer, with a faint coat swish. **Paper** has fewer clicks and more body.
- **Master:** two-pass linear loudness normalisation to **−15 LUFS integrated**, with a **true-peak ceiling of −1.5 dBTP**. The measured values are in the delivery notes.
- No music.

## Pipeline

```bash
bash scripts/render_final.sh
```

1. Remotion renders the clean picture and the soundtrack (`Phase01Clean`).
2. `paint_pass.py` paints every frame.
3. Remotion renders the subtitle/title layer with transparency (`CaptionsOverlay`).
4. The audio is mastered (two-pass loudnorm plus a true-peak limiter).
5. The composites are written: `phase01_v2_final.mp4` (with subtitles) and `phase01_v2_clean.mp4`.

## Remaining limitations (honest)

- **Still a 2D cut-out rig, not hand-painted animation.** Faces are much richer but stylised, head turns are limited to about ±20°, and fabric moves by authored sway, not simulation.
- **The painterly pass unifies but can't invent.** It reads as painted gouache, not as a fully hand-painted matte. The biggest remaining step up would be painted key art for the backgrounds, from a human artist or an image model you authorise; the current shots, rigs and timing would carry over unchanged.
- **Sound effects are synthesised.** They're convincing at this level in the mix, but recorded foley (paper, footsteps, real dawn ambience) would be more natural still. Every cue is already a separate, named track ready to swap.
