# Vehicle sprite batch provenance

Generated with the built-in ImageGen tool on 2026-09-03 for the Alpha Centauri live-scene asset library. Each image was generated in a separate call as an original, isolated, orthographic/isometric 3D strategy-game object with a genuine transparent background; prompts prohibited text, logos, watermarks, people, scenery, and drop shadows.

| Asset | File | Prompt subject |
| --- | --- | --- |
| Tracked construction rover | `public/sprites/vehicles/tracked-construction-rover-v1.png` | Six-tread construction rover with folded excavation arm, cable reel, amber work lamps, ceramic/graphite industrial finish. |
| Survey rover | `public/sprites/vehicles/survey-rover-v1.png` | Six-wheel autonomous survey rover with lidar, sample arm, teal scanning beacon, ceramic/graphite chassis. |
| Cargo hauler | `public/sprites/vehicles/cargo-hauler-v1.png` | Eight-wheel cargo hauler with a flatbed, strapped sealed cases, warning lights, and heavy suspension. |
| Maintenance drone | `public/sprites/vehicles/maintenance-drone-v1.png` | Four-ducted-rotor hovering repair drone with articulated arm, amber hazard lamp, and teal diagnostics. |
| Cargo pallet | `public/sprites/vehicles/cargo-pallet-v1.png` | Modular industrial pallet with sealed supply crates, straps, tie-downs, and amber safety reflectors. |

Alpha validation used ImageMagick `identify`: every delivered PNG reports `srgba`, alpha minimum `0`, and nonzero alpha maximum. This confirms transparent pixels as well as visible sprite pixels are present.
