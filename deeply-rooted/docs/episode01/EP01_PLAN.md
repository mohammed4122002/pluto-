# Episode 01 · *When Life Doesn't Go as Planned*: production plan

**Reference:** Pilot01_VoiceTest (look, the Traveller, lighting, narration) and the bilingual subtitle standard (`docs/SUBTITLES_BILINGUAL.md`).
**Length:** 5:32 (9,963 frames at 30 fps).

## Narration

The new recording is used whole: 319.4 s, unedited and unstretched. It is cut only inside its own silences into six segments, with five short added pauses (the moments the plan reserves for visual silence):

| Pause | Placed after |
|---|---|
| 1.2 s | "…ended up here?" |
| 1.5 s | "…by a certain age." |
| 1.5 s | "…and that it hurts." |
| 2.0 s | the verse |
| 1.5 s | "…still unfolding." |

There is a 1 s lead-in and a 4 s closing hold. The exact placement is in `src/data/episode01/placement.json`, which both the picture and the subtitles read.

## World: four environments, reused across the whole film

| Set | Plates | Used for |
|---|---|---|
| **Lake & pier** (the pilot's world) | Night plates from Pilot 01, reused as they are. New for this episode: dawn sky and mist versions of the same two views. | Acts I, III, VI. Night and lamp at the start, rain and the lamp out during loss, dawn at the end. |
| **The road** (side view, tracking) | Sky in two palettes (dusk, dawn). Hills, road and grass are tileable strips that scroll endlessly. | Walking: timelines, the race, the next step, walking together. |
| **The plain** (high wide) | One ground plate with five winding paths, plus a dusk sky and a dawn sky. | People growing at different paces; looking back; the whole picture. |
| **The hill** (side view with an underground cut) | Hill, soil and stones, with a pre-dawn sky and a morning sky. The tree and roots are drawn in code and grow. | Quiet growth, letting go, the outro. |

Story devices are cheap, code-driven, and each is used with a purpose:

- **The lamp** stands for hope. It is on at the start, goes out on "had other plans", and returns on "don't let one painful chapter…".
- **The imagined self** is the luminous version of him he expected to be. He chases it in the race, it dissolves, and at the end it walks beside him and merges into him.
- **The roots** are growth no one sees, the channel signature.
- **Ghost figures** stand in for people who are no longer beside him.
- **Drifting lights** stand for the things we lose.
- **Rain** carries the grief section.

**Colour arc:** night (Acts I–III) → pre-dawn (Act IV) → dawn (Act V) → morning (Act VI).

**Subtitle-safe zone:** in every shot the Traveller's feet, and every key detail, stay above y = 905 at 1080p. The ground lines are placed so they sit above it.

## Shot list (film time)

| # | Time | Narration (start) | Set | Picture |
|---|---|---|---|---|
| 1 | 0:00 | "When life doesn't go as planned…" | Lake night, sky | Night sky and lake in mist with a slow drift. Bilingual title card in the centre. |
| 2 | 0:06 | "Have you ever looked at your life…" | Lake night, medium | Pilot shot 1: his head lowers. |
| 3 | 0:09 | "…and wondered how you ended up here?" | Lake night, wide | Pilot shot 2: crane-up reveal; he turns back on "here". |
| 4 | 0:12 | "Not because everything is terrible…" → "…version of yourself by now." | Lake night, medium | He lifts his head. His luminous imagined self appears over the water, standing tall. |
| 5 | 0:24 | "Maybe you thought you'd be happier…" → "…make sense." | Lake night, medium | Faint figures of the people who were beside him appear, then fade. |
| 6 | 0:38 | "But life… had other plans." | Lake night, wide | The lamp flickers and goes out. |
| 7 | 0:41 | "And sometimes the hardest part…" | Lake night, medium, dark | The imagined self dissolves into the mist. |
| 8 | 0:49 | "But what if you're not falling behind?…" | Road, dusk | Dissolve. He walks, tracking side view. |
| 9 | 0:55 | "…invisible timelines… I should be happier." | Road, dusk | A faint golden timeline with ticks runs across the land; a tick lights on each "I should…". |
| 10 | 1:08 | "…a race against a version of ourselves…" | Road, dusk | The imagined self walks ahead, faster. He hurries, it dissolves, he stops. |
| 11 | 1:15 | "We forget that people grow differently…" | Plain, dusk | Many travellers on different paths and at different paces; two walk together, one sits. |
| 12 | 1:35 | "There is no universal timeline…" | Plain, dusk | The camera rises. He starts walking his own path at his own pace. |
| 13 | 1:44 | "So please, stop treating your life like a deadline…" | Road, dusk | He stops and breathes; slow push-in. Pause. |
| 14 | 1:54 | "And then, there are the things we never wanted to lose…" | Lake night, medium | Lamp out, rain. A small light drifts away over the water on each loss. |
| 15 | 2:05 | "Losing something you truly wanted hurts…" | Lake night, medium | He sits hugging his knees in the rain. |
| 16 | 2:15 | "Sometimes you just need to sit with the feeling…" | Lake night, wide | Static hold: a tiny seated figure in the rain. Pause. |
| 17 | 2:25 | "But don't let one painful chapter…" | Lake night, medium | The rain stops and the lamp comes back on. He lifts his head and stands. |
| 18 | 2:41 | "Sometimes, the most important growth happens quietly…" | Hill, pre-dawn | Underground, roots grow beneath a sapling. |
| 19 | 2:47 | "When there are no achievements…" → "That matters too." | Hill, pre-dawn | He kneels by the sapling and gets up again. |
| 20 | 2:55 | "Maybe you need to hear this today… You are allowed…" | Lake dawn, wide | He walks back along the pier toward us as the sky brightens. |
| 21 | 3:14 | "Don't underestimate the quiet courage…" | Road, dawn | Walking, wide. |
| 22 | 3:25 | "Sometimes it's choosing peace…" → "…left to be written." | Road, dawn | Walking, closer. |
| 23 | 3:39 | "And perhaps there is another way…" | Hill, dawn | He opens his hand; a small light floats free. |
| 24 | 3:47 | The verse (Al-Baqarah 2:216) | Lake dawn, sky | Calm sky at first light with no action. The Arabic line carries the Qur'anic text. Pause. |
| 25 | 4:02 | "Think about that for a moment…" | Plain, dawn | He looks back along the winding path behind him. |
| 26 | 4:17 | "This doesn't mean…" → "God knows the whole picture." | Plain, dawn | From close on him, a long pull-back to the whole land. |
| 27 | 4:31 | "And sometimes faith means taking the next step…" | Road, dawn, fog | He steps forward into the fog. |
| 28 | 4:37 | "So, if life doesn't look the way you planned…" | Lake dawn, medium | Bookend: the same spot as the opening, now at sunrise. He breathes. |
| 29 | 4:49 | "Keep growing. Keep learning. Keep becoming…" | Hill, morning | The tree has grown and the roots glow. He stands beside it. |
| 30 | 4:56 | "Because life isn't only about reaching…" | Road, morning | His imagined self walks beside him, then merges into him. |
| 31 | 5:04 | "And wherever you are right now…" | Plain, morning | He walks his path toward the sunrise. Pause. |
| 32 | 5:16 | "This is Deeply Rooted…" | Hill, morning | The tree and the roots. End card. |

## Render plan

The film renders as one composition, cut into resumable chunks, roughly one per act.

- **Checkpoint first:** 0:00–1:30 (Acts I–II, part).
- **Picture passes:** raw picture → light paint pass. Both are the pilot's settings.
- **Subtitles:** burned in by the bilingual burner, which renders each cue once and blends it with the component's exact fade curve, avoiding a full-length transparent render.
- **Audio:** rendered once, then mastered to −15 LUFS, true peak ≤ −1.5 dBTP.
- **Deliverables:** bilingual master, clean master, EN and AR SRT files, contact sheet, production report.
