# Phase 01 — Visual Prompts & Animation Specifications

These specs describe the **prototype as built**. Each scene has:
- a shot design an animator or editor can reproduce exactly;
- the camera, lighting and animation numbers used;
- a **generation prompt** locked to the approved character, ready for an external image or video model (for example to repaint key frames at higher fidelity later).

---

## 0. Locks (paste into every prompt)

### Style lock
> premium cinematic 2D/3D hybrid animated short film, painterly matte-painting environments with soft brush texture, layered atmospheric depth, volumetric mist, natural soft shadows, subtle film grain, restrained low-saturation palette of warm ivory #F2EDE3, muted beige #C8B9A5, deep charcoal #303238, misty gray #8D969B, olive green #747D58, muted brown #806854 and soft golden light #D9B77D, independent arthouse animation for adults, 16:9, no text, no logos, no watermark

### Character lock: *The Walker* (see `out/character_reference_sheet.png`)
> the same adult man in his late twenties, slim, medium height (178 cm, about 7.6 heads), warm olive-brown skin, long oval face with a straight defined jaw, straight medium nose, calm dark-brown eyes, straight dark brows, light stubble, short dark-brown hair with a soft tousled top swept toward his right and short sides; knee-length charcoal wool overcoat worn open with notched lapels, cream crew-neck knit sweater with fine vertical rib, dark-brown straight trousers, worn tan leather ankle boots with dark soles, faded beige canvas satchel with the strap running from his LEFT shoulder to his RIGHT hip; restrained acting through posture, breath and gaze

### Prop lock: the map
> an aged warm-ivory paper map, 60 × 40 cm, folded in 3 × 2 panels with soft creases, hand-drawn in sepia ink as an old pictorial map: hills drawn in profile with short hatch strokes, a dashed route winding from a small circle up to an olive tree drawn on a hill, a compass rose, a river, small ploughed-field sketches, no readable words

### Environment locks
- **Present:** expansive misty upland just before sunrise. A crossroads where five worn earth paths meet. One ancient olive tree on a low rise in the far mist. Layered blue-gray hills. Cool blue-gray dawn, with a faint gold glow low on the right horizon.
- **Imagined:** the same kind of land seen as he hoped it would be. One clear winding path to a flourishing olive tree on a gentle hill. Warm low sun behind the tree. Golden haze, olive-gold grass.

### Negative prompt
> cartoonish, chibi, childish, stick figure, anime exaggeration, glossy plastic 3D, oversaturated, neon, stock photo, lens-flare spam, readable text, letters, watermark, logo, extra fingers, distorted hands, different face, different clothes, satchel strap on the wrong shoulder, character morphing, harsh god rays

---

## Scene 01 — How Did I End Up Here?

| | |
|---|---|
| Frames | 0–329 (11.0 s) |
| Voiceover | "Have you ever looked at your life… and wondered how you ended up here?" |
| Lens | ~50 mm (f = 2637 px) · horizon at 47% of frame height |
| Camera | Real 3D dolly: from 30 m to 20 m from him, height 2.8 m → 2.4 m, drifting 0.95 m right; ease-in-out over the whole shot |
| Focus | On him (deep focus, aperture 9) |

**Shot.** A wide, quiet frame:
- **The man:** small, standing on the right third where five paths meet, the folded map in his near hand.
- **Leading line:** the road he came along runs up from the bottom of the frame to him.
- **Paths:** one exits left in the mid-ground, one bends away into the fog ahead, one curves off right, and one climbs left toward the **olive tree** standing alone on a low rise in the mist.
- **Hills:** three layers fade into blue-gray haze. The sky is soft blue-gray, with a faint gold glow low on the right where the sun will come up.

**Metaphor.** Many directions, none labelled, no signpost: uncertainty rather than fear. The tree he planned to reach is visible but faint.

**Animation.**
- **Parallax:** every element sits at a real depth, so the dolly produces true parallax. Grass near the lens slides fastest, the hills barely move.
- **Fog:** 10 mist planes at depths from 39 m to 640 m drift left at different speeds, from 0.16 m/s up to 1.2 m/s.
- **Wind:** about 900 grass clumps sway on gusts.
- **Character:** breathes (4.6 s cycle) and blinks. His coat hem moves in the wind. On "wondered" his head turns toward the far paths (frames 114–160, ease-in-out-cubic) with a slight tilt, then settles (248–302). His body geometry never changes.

**Transition out.** At 310–350 a dense mist bank rolls across the lens right-to-left. The cut to Scene 02 happens at peak density (frame 330).

**Generation prompt (key frame).**
> [STYLE LOCK]. Wide establishing shot just before sunrise: [CHARACTER LOCK] stands small and alone on the right third of frame at a crossroads where five worn earth paths meet in an expansive misty upland, holding the folded paper map loosely at his side, head turned toward the paths fading into fog. One path climbs toward a single ancient olive tree on a low rise, faint in the mist. Layered blue-gray hills dissolve into haze, ground mist hugs the grass, soft blue-gray dawn light with a faint gold glow on the right horizon. Uncertain, contemplative, not fearful. Camera slightly elevated (2.8 m), 50 mm lens, deep focus.

**Motion prompt (image-to-video).**
> slow forward dolly toward the man over 11 seconds, strong natural parallax, fog layers drifting left at different speeds, grass swaying gently, his coat hem moving in the wind, he breathes and slowly turns his head toward the far paths, no cuts, no zoom, no morphing

---

## Scene 02 — This Was Not the Plan

| | |
|---|---|
| Frames | 330–719 (13.0 s) |
| Voiceover | "Not because everything is terrible. But because… this isn't where you thought you would be." |
| Lens | ~80 mm (f = 4200 px) for portrait compression · horizon at 36.5% |
| Camera | Same world, same axis. Slow push from 4.6 m to 4.1 m from him at 1.5 m height; he sits on the right third |
| Focus | Him/the map → rack to the paths behind him (532–580, 38 m) → back to him (640–674) |

**Shot.**
- **Framing:** medium shot, head to hips. He faces three-quarter left.
- **Background:** behind him on the left, two paths wind away into the mist, and the olive tree appears faintly top-left.
- **The map:** he lifts the folded map from his side and opens it at his waist. The bottom fold drops, the panels swing open, and his far hand takes the left edge. The ink route and the tree glyph are visible on the paper.
- **The look up:** he studies the map with small reading eye movements, then raises his eyes to the landscape on "this **isn't**…".
- **Focus:** racks from him to the paths behind him. The drawn route and the real paths don't match.

**Metaphor.** The plan on paper is clear. The world in front of him is several faint paths in fog.

**Animation.**
- **Unfold:** folded packet at his side → map raised to the waist (340–370) → bottom row opens (368–406) → columns swing open accordion-style (404–448). Panels show the plain paper back while edge-on.
- **Wind:** the free panel flutters, bending about its own hinge so the creases stay continuous.
- **Face:**
  - looking down: lids lowered, head pitched 8.5°;
  - looking up: lids open, gaze moves left;
  - "isn't": brows lift a little and the mouth corners settle a little.
- **Sigh:** a quiet exhale at 596–642, shoulders dropping 0.9 cm.
- **Exit:** he lowers his eyes to the map (682–712).
- **Fixed throughout:** the character asset, the environment and the palette are the same as Scene 01. Only the camera moved.

**Adjustment vs. brief.** The brief asks for the paths "behind him" while the landscape in front "does not match". Both are honoured:
- he looks off-frame left at the landscape in front of him;
- the rack focus reveals the paths behind him that the audience can see.

The wide-to-medium change uses a mist pass instead of a 9× digital zoom, which would read as "a static image with a zoom" (explicitly to be avoided).

**Generation prompt (key frame).**
> [STYLE LOCK]. Medium shot, 80 mm, of [CHARACTER LOCK] on the right third of frame at the same misty crossroads, three-quarter view facing left, holding [PROP LOCK] open at waist height with both hands, thumbs on the paper. He has just lifted his eyes from the map toward the landscape: quiet disappointment, inner brows slightly raised, mouth neutral, shoulders soft. Behind him on the left two worn paths wind away into the mist and an olive tree is faint in the distance. Soft diffused dawn light, cool blue-gray palette, background softly out of focus.

**Motion prompt.**
> he unfolds the map naturally, paper flexing gently in the wind, he studies it, then slowly lifts his eyes to the distance; the camera holds with a very slow push; rack focus from him to the paths in the background and back; restrained facial animation, identical character throughout

---

## Scene 03 — The Life We Imagined

| | |
|---|---|
| Frames | 720–1229 (17.0 s) |
| Voiceover | "You had plans. You had dreams. You imagined a different version of yourself by now." |

### 03a — POV of the map (720–800)
- **Shot:** we cut on his downward glance into his point of view. The open map fills the centre of the frame, held at both edges by his hands: the backs of the hands just outside the paper, the thumbs on the sheet. Charcoal coat sleeves with cream cuffs lead out of the bottom corners. Far below, blurred, are the path, the grass and the toes of his tan boots.
- **Camera:** a push into the drawn route, scale ×0.5 → ×1.0 on a logarithmic curve with an ease-out-sine landing. The hands slide out of frame and the ground behind moves less (parallax). A gentle handheld-breath drift and rotation fade out as we arrive.
- **Light:** a cool wash on the paper begins to lift.

### 03b — The match (800–884)
- **The match:** at frame 800 the map art sits exactly on top of the imagined world. The route, the hill lines and the tree glyph were drawn from that world's camera projection.
- **Reveal:** the paper dissolves **outward from the ink route** like a watercolour wash: a turbulent, displaced, blurred mask grows from the route and the tree. Warm pigment gathers at the wet edge.
- **Ink:** the ink lines stay on top for a beat, lying exactly on the real path, hills and tree, then fade (834–890).
- **Crease lines:** fade by 840.
- **Camera:** the imagined world's camera starts moving at 850 (ease-in), so the push carries on *into* the world.

### 03c — The imagined future (850–1096)
- **Camera:** ~50 mm, 1.65 m height, moving 3.6 m forward and 0.45 m right.
- **The man:** walks away from us up the clear winding path toward the flourishing olive tree at 1.25 m/s. Full back-view walk cycle:
  - stance and swing legs, with the heel lifting to show the sole;
  - pelvis bob and sway;
  - shoulders counter-rotating;
  - arms swinging opposite the legs;
  - coat hem swinging.
- **Light:** the sun glow rises from 0.35 to 1.25 between 800 and 1000. Rim light outlines him, and the olive leaves catch gold and rustle. The grade warms from cool (−0.6) to warm (+0.95).

### 03d — Return to the present (1096–1229)
- **Mist:** warm mist rolls in (fog ×4), then its colour cools while a full-frame mist passes. The imagined world dissolves away (1120–1160).
- **Present:** we're back on the medium shot from Scene 02, the map open in his hands, the olive tree faint behind. He slowly lifts his eyes (1170–1210).
- **End:** fade to charcoal (1204–1229).

**Metaphor.** The line he drew became a world in his mind: clear path, warm sun, a confident version of himself. It is only paper, and the mist of the real present returns.

**Generation prompts.**
- **03a key frame:** [STYLE LOCK]. First-person point of view looking down at [PROP LOCK] held open in two hands: olive-brown hands at the left and right paper edges, thumbs on the sheet, charcoal coat sleeves with cream knit cuffs entering from the bottom corners. Far below, soft and out of focus, a pale earth path, misty grass and the toes of worn tan leather boots. Cool dawn light on the paper.
- **03b transition:** a hand-inked dashed route on aged paper dissolving outward like a watercolour wash into a real painted landscape, the ink lines lying exactly over the real path, hills and olive tree before fading; warm pigment blooming at the wet edge; poetic and seamless, not a slideshow.
- **03c key frame:** [STYLE LOCK]. [CHARACTER LOCK] seen from behind, walking confidently up a clear winding pale earth path through olive-gold grass toward a flourishing ancient olive tree on a gentle hill. Warm low sun behind the tree, golden haze, soft hills fading into warm light, rim light along his shoulders and hair. Hopeful, dreamlike but restrained.
- **03c motion:** he walks naturally away from the camera with a steady confident gait, coat hem swinging, the camera following slowly with gentle parallax, olive leaves rustling, sunlight warming gradually.
- **03d motion:** warm mist rolls across the frame and cools to blue-gray, revealing the same man back at the misty crossroads in medium shot, holding the open map, slowly lifting his eyes.

---

## Global finish
- **Grade:** saturation 0.88, contrast 0.97, blacks lifted (screen 5%), vignette 0.42.
- **Temperature:** a soft-light wash from cool `#7F8C96` in the present to warm `#D9B77D` in the imagined world.
- **Film grain:** 1024² tiles, cycled every frame at random offsets, overlay at 8.5%.
- **No on-screen text, subtitles, music or sound effects in Phase 01.**
