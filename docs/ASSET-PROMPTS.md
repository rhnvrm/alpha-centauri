# Asset prompts and provenance

This file records the design prompts. Images are concepts, not implemented game screenshots or finished 3D meshes.

## A — Main-play visual target

Use case: ui-mockup
Asset type: landscape gameplay visual target for an isometric 3D strategy game demo.
Primary request: Design a polished in-game screen for THE INTENT HORIZON, a game about governing an Alpha Centauri colony through delayed instructions to a local AI steward named Daneel. This is a real game composition, not a SaaS dashboard. The colony map occupies about three quarters of the screen; a compact correspondence panel occupies the remaining right-hand quarter. Thin top status strip and bottom RTS command deck. Wide 16:9 composition.
Scene/backdrop: an alien rocky plateau and wetland, with a small believable frontier city of pale ceramic habitats, ribbed industrial modules, glass hydroponic greenhouses, a reservoir, solar arrays, service roads, a relay dish, and a few small construction robots. High orthographic isometric camera, approximately 35 degrees elevation, no vanishing point. Detail and legible silhouettes reminiscent of classic pre-rendered strategy games, presented as modern actual 3D. Original art, no borrowed game assets.
Style/medium: refined in-game 3D render with crisp, restrained RTS UI; grounded science-fiction, patient scientific mood, warm low sunlight, soft contact shadows, fine material detail; no toy-like chunky low-poly cubes.
Color palette: weathered ivory structures, oxidized copper service machinery, muted teal alien wetlands, dry ochre terrain, dark graphite interface with parchment text and restrained amber accents.
Composition: solid buildings represent received observations. Two ghosted amber wireframe building footprints indicate orders still in flight. Right panel headed DANEEL with a received letter, a larger empty intent-composition field, a compact bandwidth meter, and a TRANSMIT button. Bottom strip is a thin visual Earth-to-colony radio timeline with small packet markers. Include a small minimap and a selected rover command card. UI must not obscure the world.
Text, use only these short labels if space allows: "THE INTENT HORIZON", "MISSION II / NEW ALEXANDRIA", "EARTH 2281.04", "OBSERVED 2276.67", "DANEEL", "Write an intent…", "864 / 2800 bits", "ARRIVAL 2285.41", "TRANSMIT", "EARTH", "4.37 YEARS", "COLONY". Avoid paragraphs and tiny fake text.
Constraints: readable calm layout, coherent architecture, consistent lighting and world scale, no invented performance claims, no purple neon, no combat, no borrowed logos, no watermark. This is design reference, not a claim of a finished product.

Generator: built-in ImageGen, 2026-09-03. Saved output: [main-play-v1.png](concepts/main-play-v1.png).

Visual QA: the world scale, correspondence panel, and pending-order ghosts establish the intended direction. Generated prose inside the received letter is illustrative and incorrectly signed "The Council"; the implemented UI must use original, live Daneel messages instead. The mockup omits several planned resource and time controls, which remain required by DESIGN.md. This image is neither the final layout specification nor a playable screenshot.

## B — Structures and robots concept sheet

Use case: stylized-concept
Asset type: cohesive isometric game-asset concept sheet to guide 3D models and command-card icons, not a runtime spritesheet.
Primary request: Nine isolated original science-fiction colony assets, arranged in a clean three-by-three grid with generous spacing. Top row: relay administration building with dish; modular ceramic habitat; glass hydroponic greenhouse with visible crop rows. Middle row: solar panel array and battery together; cylindrical reservoir and attached pump; compact fusion power plant. Bottom row: survey rover with mast; tracked construction robot with manipulator; small cargo hauler carrying a mineral container.
Scene/backdrop: plain warm graphite background; no environment scene and no text.
Style/medium: detailed but legible isometric 3D object renders, not flat icons or pixel art. Functional frontier machinery with retro-futurist civic architecture. Each object has a distinctive silhouette readable from gameplay distance. Pale ceramic, ribbed gunmetal, copper-orange service accents, muted teal glass. No weapons.
Composition: identical orthographic isometric orientation and top-left warm lighting for all nine assets. Full objects contained in their cells; no cropping. Structures share a logical tile size; bottom-row robots are presented at larger reference scale so their mechanical details can be read, not mistaken for equal-size structures.
Constraints: consistent original visual vocabulary, no borrowed game models, no labels, no watermark, no drop-shadow overlap between cells. This sheet guides actual 3D modeling; it is not a substitute for selectable game geometry.

Generator: built-in ImageGen, 2026-09-03. Saved output: [structures-and-robots-v1.png](concepts/structures-and-robots-v1.png).

Visual QA: nine coherent isolated assets, recognizable silhouettes, consistent material vocabulary. Opaque background and enlarged robot reference scale are intentional: this is a modeling concept sheet, not a transparent runtime atlas. The covered cylindrical water tank is one visual option; gameplay needs a visible fill gauge or cutaway consistent with the reservoir mechanic. Model geometry, collision footprints, rigging, and runtime animations have not been produced.

## C — Colony kit refinement

Use case: stylized-concept
Asset type: six-piece isometric colony kit used as a visual reference for the runtime meshes.
Primary request: Original Alpha Centauri frontier assets: ceramic relay with copper dish, three-dome habitat, blue-green solar array, glass greenhouse with crop rows, tracked construction rover with teal mast, and cargo hauler. Keep every asset fully visible and well separated on a deep charcoal background.
Style/medium: premium hand-painted 3D strategy-game concept art; warm double-sun key light, cool teal fill, weathered ivory ceramic, copper service details, no text or logos.
Constraints: original science-fiction design, no people, no weaponry, no watermark, no borrowed game assets.

Generator: built-in ImageGen, 2026-09-03. Saved output: [colony-kit-v1.png](concepts/colony-kit-v1.png).

Visual QA: the new relay, solar, greenhouse, and rover silhouettes are now reflected in the procedural Three.js scene through an illuminated relay beacon, panel-grid solar arrays, visible greenhouse crop rows, stronger terrain lighting, and native-wetland silhouette dressing. This remains a reference sheet, not a runtime texture atlas.

## D — Title-screen colony panorama

Use case: stylized-concept
Asset type: original title-screen hero art for the playable browser demo.
Primary request: a dense high-angle alien coastal colony with a central relay dish, habitat domes, hydroponic greenhouses, solar fields, reservoirs, workshops, service roads, small rovers, rocky regolith, and luminous teal shallows. Leave the left third darker for live title typography.
Style/medium: premium grounded retro-futurist strategy-game key art, with warm double-sun late-afternoon light and cool teal ambient fill.
Constraints: original composition, no people, words, logos, UI, watermark, or borrowed game assets.

Generator: built-in ImageGen, 2026-09-03. Saved output: [title-hero-v2.png](concepts/title-hero-v2.png).

Visual QA: this supports the title and mission-selection mood only. The interactive colony remains live Three.js geometry and cannot claim this raster scene as a gameplay screenshot.

## E — Runtime facility sprites

Use case: runtime transparent facility sprites for the live Three.js colony, generated in parallel.
Asset type: isolated orthographic/isometric 3D strategy-game objects with genuine alpha backgrounds; each remains a selectable, telemetry-derived entity rather than part of a baked world image.

Primary requests: (1) a ceramic-and-copper relay station with a teal beacon; (2) a compact three-dome habitat with service pipes and rover; (3) a solar array and hydroponic greenhouse utility cluster; (4) a reservoir, battery, and industrial service cluster. All use the established weathered ivory, copper, graphite, teal-glass visual language, no text, no logo, no people, no weapons, no watermark.

Generator: built-in ImageGen, 2026-09-03. Saved outputs: [relay-v1.png](../public/sprites/relay-v1.png), [habitat-v1.png](../public/sprites/habitat-v1.png), [solar-greenhouse-v1.png](../public/sprites/solar-greenhouse-v1.png), and [utility-v1.png](../public/sprites/utility-v1.png).

Runtime use: `ColonyScene` maps each observed facility type to one of these transparent sprites, retains a small physical plinth for selection and terrain contact, and falls back to procedural geometry only for an asset type without a matching sprite. This keeps the information boundary intact: in-flight Earth orders stay amber wireframes and unobserved local facilities never receive sprite art.
