# Elsaboungy hourglass ad — voice-over guide (phase 2)

Total length: 25.00 s @ 30 fps. Generated from src/config/timeline.json — rerun `npm run vo:guide` after retiming.

| # | Scene | In | Out | Seconds | Voice-over line (Egyptian Arabic) |
|---|---|---|---|---|---|
| 1 | 01 — Rush hour: traffic, errands, shopping, the clock running | 00:00:00.000 | 00:00:05.500 | 5.5 | زحمة.. ومشاوير.. وطوابير.. والوقت بيجري. |
| 2 | 02 — The hourglass: foam, bubbles, flip | 00:00:05.500 | 00:00:10.000 | 4.5 | وقتك أغلى من إنك تضيّعه في المشاوير. |
| 3 | 03 — Ordering cleaning products on a cartoon phone | 00:00:10.000 | 00:00:15.000 | 5 | اطلب منظفاتك من الصابونجي أونلاين.. بضغطة زرار. |
| 4 | 04 — The order arrives at the door, then comfort at home | 00:00:15.000 | 00:00:20.000 | 5 | وطلبك يوصل لحد باب البيت.. ووقتك يفضل ليك. |
| 5 | 05 — Logo, foam & bubbles, website, WhatsApp, slogan | 00:00:20.000 | 00:00:25.000 | 5 | الصابونجي لبيتي.. والنظافة تحكي حكاياتي. |

Recording notes:
- Keep each line inside its scene window; leave ~0.3 s of air before a cut.
- Deliver one WAV (48 kHz) for the whole ad → public/audio/voiceover/voiceover.wav, or one clip per scene → public/audio/voiceover/<scene-id>.wav.
- Then set the paths in src/config/audio.json and render `npm run render:vo`.
