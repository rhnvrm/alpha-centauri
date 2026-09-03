# Terrain sprite provenance

These original transparent PNG sprites were generated with the built-in ImageGen
tool on 2026-09-03 for the local sprite batch. They are not currently wired into
the scene.

| Asset | Prompt summary | Output |
| --- | --- | --- |
| `public/sprites/terrain/rocky-outcrop-v1.png` | Low, broad charcoal-basalt alien outcrop with muted rusty-ochre seams; isometric expedition-game sprite. | 1536 × 1024 sRGBA |
| `public/sprites/terrain/wetland-pond-reeds-v1.png` | Compact shallow teal pond, rust reeds, wet black stones, and pale mineral deposits; isometric terrain-tile sprite. | 1536 × 1024 sRGBA |
| `public/sprites/terrain/supply-crates-v1.png` | Small stack of weathered charcoal expedition hard cases with muted ochre hazard bands; isometric prop sprite. | 1536 × 1024 sRGBA |
| `public/sprites/terrain/amber-construction-scaffold-v1.png` | Unfinished compact habitat footprint with tubular framing, braces, hoist, and amber safety panels; isometric construction sprite. | 1536 × 1024 sRGBA |
| `public/sprites/terrain/road-signal-post-v1.png` | Slim rugged road-edge signal post with amber beacon, radio panel, and bolted base; isometric infrastructure sprite. | 1024 × 1536 sRGBA |

All prompts required a real transparent background, a single centered asset with
generous padding, no ground-plane rectangle, no text/logos/watermarks, and no
people or vehicles. ImageMagick validation confirmed each file has sRGBA
channels with alpha minimum `0` and alpha maximum `0.996078`.
