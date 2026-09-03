# Architecture sprite provenance

Generated 2026-09-03 with Codex built-in ImageGen, one generation call per
asset. Each prompt requested an isolated, orthographic-isometric 3D colony
building with a genuinely transparent background; no reference images were
used. Assets are new project-local art, not replacements for existing files.

| Asset | File | Generation prompt subject |
| --- | --- | --- |
| Workshop | `public/sprites/architecture/workshop-v1.png` | Modular off-world fabrication workshop with crane arm and service panels. |
| Iridium mine | `public/sprites/architecture/iridium-mine-v1.png` | Robotic extraction shaft, mining head, hopper, and conveyor housing. |
| Launch pad | `public/sprites/architecture/launch-pad-v1.png` | Empty angular launch platform with ignition ring, guidance mast, and service gantry. |
| Battery bank | `public/sprites/architecture/battery-bank-v1.png` | Compact stacked energy-storage cabinets, cooling fins, and transformer. |
| Reservoir | `public/sprites/architecture/reservoir-v1.png` | Sealed cylindrical water tanks with filtration housing and pipes. |

Validation after placement: all five are PNG RGBA/sRGBA files and ImageMagick
reports `opaque=False`. Alpha extraction found a zero-alpha minimum for every
asset (and nonzero maximums), confirming retained transparent pixels.
