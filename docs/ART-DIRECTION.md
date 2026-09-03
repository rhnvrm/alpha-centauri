# Art direction and production pieces

## The visual sentence

A compact, believable frontier settlement seen from the patient distance of an old strategy game: pale civic architecture, weathered industry, little working machines, and an alien landscape that existed long before the colony.

It should feel like a place the player cares about, not a collection of resource icons. Machinery is utilitarian, settlement planning has civic order, and scientific uncertainty is visible in the terrain. No borrowed game models, textures, logos, screenshots, or literary quotations.

## Camera and rendering

- Actual 3D meshes, orthographic projection; nominal isometric elevation 35.264°, azimuth 45°.
- Four snapped azimuths, pan, zoom. No free-fly orbit or cinematic third-person controls.
- Building footprints: 1×1, 2×2, 3×2, and one 3×3 command structure.
- One grid unit is the logical tile; art dimensions, collisions, connectors, and sprite effects use it consistently.
- Sunlight from a consistent world direction. Warm key, subdued cool fill, soft contact shadows.
- Two suns belong in mission art/sky context; avoid a second expensive real-time shadow pass.
- Readable building roofs and facing side panels. Strong silhouette at gameplay zoom, surface detail only when close.
- Keep critical units selectable when occluded; selection silhouette and footprint on top of the scene.
- Instanced terrain, trees/mats, road parts, and repeated robot pieces. Batch by material, cap shadows, offer a low-effects setting.

## Palette

| Role | Color | Use |
| --- | --- | --- |
| Command graphite | `#18201e` | HUD panels and map framing |
| Warm ivory | `#d9d4ba` | Civil structures, primary text |
| Service copper | `#b78355` | Industrial components, transmissions |
| Signal teal | `#78b4aa` | Received reports, grid indicators |
| Native deep green | `#48645c` | Wetlands and branching ecology |
| Dry regolith | `#817b60` | Rocky ground, cliffs |
| Warning ochre | `#d9b46b` | Aging systems, pending orders |
| Critical rust | `#ba6252` | Failures plus icon/pattern labels |

These are proposed game colors, not a requirement for an image generator to reproduce hexadecimal values exactly.

## Asset manifest

| Piece | Count/family | Runtime format | Design requirements |
| --- | --- | --- | --- |
| Terrain | dry land, rock, floodplain, shallow water, protected wetland | instanced meshes + small texture atlas | Distinct at distant zoom; readable risk contours |
| Colonial relay/administration | 1 | modular 3D mesh | Dish, civic core, white ceramic roof; visual anchor |
| Habitat | 1 family, 2 variants | modular 3D mesh | Clear occupancy and life-support connection |
| Solar generation | 1 | mesh | Blue-green angled panels; damaged variation via materials |
| Battery | 1 | mesh | Low ribbed box; power-flow indicator |
| Reactor | 1 | mesh | Cooling structure, restrained amber service lights |
| Hydroponic greenhouse | 1 | mesh | Visible rows under glass; no opaque greenhouse rectangle |
| Reservoir | 1 | mesh | Water surface visibly changes with fill |
| Pump/desalination | 1 | mesh | Pipes, shore/connection requirement |
| Workshop | 1 | mesh | Doorway and robot-service bay |
| Mine | 1 | mesh | Extractor and ground footprint |
| Cargo depot | 1 | mesh | Stackable material/cargo containers |
| Launch pad | 1 | mesh | Cargo craft or container rail; simple launch effect |
| Roads, cables, pipes | connected pieces | instanced mesh | World-graph connectivity matches visuals |
| Survey rover | 1 | mesh | Mast and sensor silhouette; slow deliberate animation |
| Construction robot | 1 | mesh | Compact tracked base and manipulator |
| Cargo hauler | 1 | mesh | Distinct cargo bay; visible load state |
| Native mat and spires | 3 silhouettes | meshes + decals | Biological, non-terrestrial, clearly not a mineral deposit |
| Daneel portrait | 1 neutral portrait | raster | Patient, understated, no menacing red-eye cliché |
| Mission plates | 3 crops/compositions | raster | Landing / living city / divided frontier |
| Construction & signal effects | small set | sprite atlas + particles | Blueprint, dust, pulse; never bake a fake state into art |
| Building/command icons | reused silhouettes | SVG or render-to-texture | Readable 24–40 px; match runtime structures |

## First design deliverables

1. One main-play visual target showing the isometric world with the correspondence HUD.
2. One consistent structure-and-unit concept sheet to guide real 3D mesh production.
3. A vector/code-native UI wireframe using live text and component dimensions, after concept selection.

Do not generate dozens of separate sprites before the camera, palette, scale, and silhouettes are stable. Building sprite sheets are useful as reference or command-card art, not the primary 3D implementation.

## Asset quality checks

- A scene illustration is a visual target, not a runnable screenshot.
- Verify logical footprint and consistent scale before modeling.
- Check raster alpha, edge halos, padding, atlas bounds, and animation alignment where applicable.
- Keep UI text out of game textures and models. Localize/live-render it in the UI.
- Expose operational, damaged, selected, queued, and unpowered states through materials and geometry, not entirely separate large images.
- Store prompts, generator provenance, outputs, and chosen variants with the project.
- Produce only the selected final assets. Do not install Gemini image extensions or services without a clear need and user authorization for that installation.

## Generation availability at this design checkpoint

Gemini CLI is installed. Its local extension and MCP listings report no installed extensions and no configured MCP servers. That alone does not establish a usable raster-image generation pipeline. Use the available built-in image-generation tool for this concept pass; preserve portable briefs for Gemini or another chosen production workflow later. No runtime game dependency on an asset-generation service.
