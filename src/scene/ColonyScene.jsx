import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BUILDINGS } from '../game/constants.js';
import { gridComponents } from '../game/networks.js';
import { createColonyRenderer, disposeObjectTree } from './renderer.js';

const palette = { regolith: 0x978d69, rock: 0x5d6258, wetland: 0x3f756c };
const buildingColor = { relay: 0xd9d4ba, habitat: 0xc8c3ac, solar: 0x477e8b, greenhouse: 0x78b4aa, reservoir: 0x3e7880, workshop: 0xb78355, mine: 0x88725b, launch: 0xb78355 };
const cell = (x, y) => [ (x - 16) * 1.1, (y - 16) * 1.1 ];
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .12, ...options });
const addMesh = (group, geometry, color, position, options = {}) => {
  const mesh = new THREE.Mesh(geometry, material(color, options));
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
};
const tileData = (x, y) => ({ id: `tile-${x}-${y}`, kind: 'tile', x, y });
const buildingFootprint = (building) => BUILDINGS[building.type]?.footprint || [2, 2];
const surveyedCell = (surveyedTiles, x, y) => surveyedTiles.has(`${x},${y}`);
const receivedBuilding = (building, surveyedTiles) => {
  const [width, height] = buildingFootprint(building);
  for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) {
    if (!surveyedCell(surveyedTiles, building.x + dx, building.y + dy)) return false;
  }
  return true;
};
const receivedEntity = (entity, kind, surveyedTiles) => kind === 'building'
  ? receivedBuilding(entity, surveyedTiles)
  : surveyedCell(surveyedTiles, entity.x, entity.y);
// Public asset paths are resolved against the active document at runtime. This preserves the
// GitHub Pages subpath and keeps the lightweight Node scene tests free of image-loader setup.
const relaySpriteUrl = 'sprites/relay-v1.png';
const habitatSpriteUrl = 'sprites/habitat-v1.png';
const solarGreenhouseSpriteUrl = 'sprites/solar-greenhouse-v1.png';
const utilitySpriteUrl = 'sprites/utility-v1.png';
const spriteUrls = {
  relay: relaySpriteUrl,
  habitat: habitatSpriteUrl,
  solar: solarGreenhouseSpriteUrl,
  greenhouse: solarGreenhouseSpriteUrl,
  reservoir: 'sprites/architecture/reservoir-v1.png',
  workshop: 'sprites/architecture/workshop-v1.png',
  mine: 'sprites/architecture/iridium-mine-v1.png',
  launch: 'sprites/architecture/launch-pad-v1.png',
  battery: 'sprites/architecture/battery-bank-v1.png',
  terrainRock: 'sprites/terrain/rocky-outcrop-v1.png',
  terrainWetland: 'sprites/terrain/wetland-pond-reeds-v1.png',
  terrainRoadSignal: 'sprites/terrain/road-signal-post-v1.png',
  terrainScaffold: 'sprites/terrain/amber-construction-scaffold-v1.png',
  terrainCrates: 'sprites/terrain/supply-crates-v1.png',
  vehicleConstruction: 'sprites/vehicles/tracked-construction-rover-v1.png',
  vehicleSurvey: 'sprites/vehicles/survey-rover-v1.png',
  vehicleCargo: 'sprites/vehicles/cargo-hauler-v1.png',
  vehicleMaintenance: 'sprites/vehicles/maintenance-drone-v1.png',
  vehiclePallet: 'sprites/vehicles/cargo-pallet-v1.png',
};
const regolithTextureUrl = 'textures/alien-regolith-v1.png';
const groundPlateTextureUrl = 'textures/asteria-ground-plate-v1.png';
const spriteScale = {
  relay: [3.5, 3.1], habitat: [4.3, 3.0], solar: [4.4, 3.0], greenhouse: [5.1, 3.35],
  reservoir: [4.1, 3.0], workshop: [4.2, 3.1], mine: [4.1, 3.0], launch: [4.9, 3.3], battery: [3.8, 2.8],
  terrainRock: [1.7, 1.35], terrainWetland: [1.85, 1.35], terrainRoadSignal: [.65, .85], terrainScaffold: [2.5, 1.95], terrainCrates: [1.05, .82],
  vehicleConstruction: [1.25, .95], vehicleSurvey: [1.12, .86], vehicleCargo: [1.35, .92], vehicleMaintenance: [.86, .8], vehiclePallet: [.76, .58],
};

function addSprite(group, texture, key, { x = 0, y, z = 0, centerY = .13, order = 3, scale = 1, rotation = 0, color = 0xffffff } = {}) {
  if (!texture) return null;
  const [width, height] = spriteScale[key] || [1, 1];
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, alphaTest: .025, depthWrite: false }));
  // Authoring a sprite's transparent canvas as if it were a physical box makes it
  // visibly hover. Keep its painted contact edge almost flush with the terrain.
  sprite.center.set(.5, centerY); sprite.position.set(x, y ?? height * centerY + .125, z); sprite.scale.set(width * scale, height * scale, 1); sprite.material.rotation = rotation; sprite.renderOrder = order; group.add(sprite); return sprite;
}

/** A broken-up dust/shadow contact patch, deliberately not a rectangular concrete slab. */
function addGroundBlend(group, width, depth, seed = 0, color = 0x27251d) {
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(.5, 9),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .66, roughness: 1, depthWrite: false }),
  );
  patch.rotation.x = -Math.PI / 2;
  patch.rotation.z = ((seed % 7) - 3) * .085;
  patch.position.y = .105;
  patch.scale.set(width * 1.08, depth * 1.05, 1);
  patch.renderOrder = 1;
  group.add(patch);
  // Two offset scuffs prevent every facility from having the same graphic footprint.
  for (let i = 0; i < 2; i += 1) {
    const scuff = new THREE.Mesh(
      new THREE.CircleGeometry(.5, 7),
      new THREE.MeshBasicMaterial({ color: i ? 0x857754 : 0x171814, transparent: true, opacity: i ? .13 : .22, depthWrite: false, side: THREE.DoubleSide }),
    );
    scuff.rotation.x = -Math.PI / 2;
    scuff.rotation.z = ((seed + i * 3) % 9 - 4) * .18;
    scuff.position.set((i ? -.17 : .2) * width, .112, (i ? .2 : -.18) * depth);
    scuff.scale.set(width * (.42 + i * .08), depth * (.18 + i * .05), 1);
    scuff.renderOrder = 2;
    group.add(scuff);
  }
}

/** Default Three shape UVs use world units, which would repeat a painted plate dozens of times. */
function normalizeIslandUVs(geometry, span = 44) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) + span / 2) / span, (uv.getY(i) + span / 2) / span);
  uv.needsUpdate = true;
  return geometry;
}

function addUtilityDressing(group, w, d, seed) {
  // Small, repeatable surface equipment gives each observed installation a working scale.
  const side = seed % 2 ? 1 : -1;
  for (const [x, z] of [[side * (w / 2 - .17), d / 2 - .16], [side * (w / 2 - .17), d / 2 - .42]]) {
    addMesh(group, new THREE.BoxGeometry(.18, .15, .18), 0x625b4c, [x, .29, z], { metalness: .3 });
  }
  const pipe = addMesh(group, new THREE.CylinderGeometry(.055, .055, Math.max(.52, d * .4), 8), 0x485150, [side * (w / 2 + .03), .38, 0], { metalness: .72, roughness: .4 });
  pipe.rotation.z = Math.PI / 2;
  for (const z of [-d * .24, d * .24]) addMesh(group, new THREE.CylinderGeometry(.035, .05, .36, 7), 0x77725f, [side * (w / 2 + .03), .28, z], { metalness: .55 });
}

function addSpriteSiteDressing(group, type, seed, textures) {
  const [spriteW] = spriteScale[type] || [3.6, 2.7];
  const padW = Math.max(2.55, spriteW * .66); const padD = Math.max(2.15, spriteW * .48);
  // Keep the authored sprite grounded without putting each one on a visibly repeated square.
  addGroundBlend(group, padW, padD, seed, type === 'launch' ? 0x393126 : 0x27271f);
  const side = seed % 2 ? 1 : -1;
  for (const z of [-.42, .28]) {
    addMesh(group, new THREE.BoxGeometry(.24, .15, .22), z < 0 ? 0x7a6043 : 0x53605b, [side * (padW / 2 - .24), .18, z], { metalness: .38 });
  }
  addSprite(group, textures.vehiclePallet, 'vehiclePallet', { x: side * (padW / 2 - .42), z: .42, y: .13, centerY: .16, order: 4 });
  addSprite(group, textures.terrainCrates, 'terrainCrates', { x: -side * (padW / 2 - .37), z: .34, y: .13, centerY: .16, order: 4 });
  const cable = addMesh(group, new THREE.CylinderGeometry(.035, .035, padW * .45, 7), 0x202927, [0, .14, padD / 2 - .18], { metalness: .55, roughness: .42 });
  cable.rotation.z = Math.PI / 2;
  for (const x of [-padW / 2 + .22, padW / 2 - .22]) {
    addMesh(group, new THREE.CylinderGeometry(.03, .05, .42, 7), 0x575549, [x, .34, -padD / 2 + .2], { metalness: .55 });
    addMesh(group, new THREE.SphereGeometry(.06, 8, 6), 0xd9a455, [x, .57, -padD / 2 + .2], { emissive: 0x6b3c0f, emissiveIntensity: 1.4 });
  }
}

function meshRoad(r, roadKeys, live, textures) {
  const group = new THREE.Group(); group.userData = tileData(r.x, r.y);
  const [wx, wz] = cell(r.x, r.y); group.position.set(wx, 0, wz);
  // Roads are continuous wheel-cut corridors, never a repeated grid of square tiles.
  // A soft central node lets the lanes join naturally at bends and intersections.
  const surface = live ? 0x454c46 : 0x5b4934;
  const shoulder = live ? 0x5e8b7e : 0x8f6e42;
  const node = new THREE.Mesh(new THREE.CircleGeometry(.31, 10), material(0x282720, { roughness: 1, transparent: true, opacity: .8 }));
  node.rotation.x = -Math.PI / 2; node.position.y = .105; node.scale.set(1.2, .92, 1); node.receiveShadow = true; group.add(node);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => roadKeys.has(`${r.x + dx},${r.y + dy}`));
  for (const [dx, dy] of directions) {
    const connector = addMesh(group, new THREE.BoxGeometry(dx ? .67 : .28, .026, dy ? .67 : .28), surface, [dx * .35, .137, dy * .35], { roughness: .96, metalness: .02 });
    connector.receiveShadow = true;
    // A narrow, offset worn edge distinguishes a service path from a generic dark stain.
    const edge = addMesh(group, new THREE.BoxGeometry(dx ? .64 : .05, .008, dy ? .64 : .05), shoulder, [dx ? dx * .35 : .12, .161, dy ? dy * .35 : .12], { emissive: live ? 0x102f2c : 0x000000, emissiveIntensity: live ? .28 : 0, roughness: .82, transparent: true, opacity: .62 });
    edge.castShadow = false;
  }
  if (live && directions.length >= 2) {
    const nodeLight = new THREE.Mesh(new THREE.CircleGeometry(.075, 10), new THREE.MeshBasicMaterial({ color: 0xd9b46b, transparent: true, opacity: .9, side: THREE.DoubleSide }));
    nodeLight.rotation.x = -Math.PI / 2; nodeLight.position.y = .215; nodeLight.renderOrder = 3; group.add(nodeLight);
  }
  // Signal-post art marks only the observed route and replaces the repeated primitive post.
  if ((r.x * 5 + r.y * 3) % 4 === 0) {
    addSprite(group, textures.terrainRoadSignal, 'terrainRoadSignal', { x: .34, z: -.34, y: .16, centerY: .11, order: 2 });
  }
  return group;
}

function meshTerrainDetail(t, userData, textures) {
  const group = new THREE.Group(); group.userData = userData;
  const [wx, wz] = cell(t.x, t.y); group.position.set(wx, 0, wz);
  const seed = Math.abs((t.x * 73856093) ^ (t.y * 19349663));
  if (t.terrain === 'rock') {
    if (seed % 11 === 0) {
      const scale = .72 + (seed % 5) * .08;
      addSprite(group, textures.terrainRock, 'terrainRock', { x: ((seed >> 3) % 25 - 12) / 100, z: ((seed >> 7) % 25 - 12) / 100, y: .13, centerY: .1, order: 1, scale, rotation: (seed % 9 - 4) * .055, color: seed % 2 ? 0xe6e0cf : 0xffffff });
    }
    else {
      const size = .09 + (seed % 4) * .025;
      const stone = addMesh(group, new THREE.DodecahedronGeometry(size, 0), seed % 2 ? 0x504f43 : 0x696451, [((seed >> 4) % 30 - 15) / 100, .13 + size * .35, ((seed >> 9) % 30 - 15) / 100], { roughness: .98 });
      stone.scale.set(1.5, .48, 1.05); stone.rotation.y = seed % 5;
    }
  } else if (t.terrain === 'wetland') {
    if (seed % 7 === 0) {
      const scale = .68 + (seed % 4) * .08;
      addSprite(group, textures.terrainWetland, 'terrainWetland', { x: ((seed >> 2) % 31 - 15) / 100, z: ((seed >> 6) % 31 - 15) / 100, y: .1, centerY: .1, order: 1, scale, rotation: (seed % 7 - 3) * .06, color: seed % 2 ? 0xd8f0df : 0xffffff });
    }
    else {
      const marsh = addMesh(group, new THREE.CircleGeometry(.27 + (seed % 3) * .045, 9), seed % 2 ? 0x477c70 : 0x396d65, [((seed >> 3) % 30 - 15) / 100, .075, ((seed >> 8) % 30 - 15) / 100], { roughness: .9, metalness: .05 });
      marsh.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 2; i += 1) {
        const reed = addMesh(group, new THREE.ConeGeometry(.022, .18 + i * .045, 5), i ? 0x719264 : 0x28564d, [-.11 + i * .18, .16 + i * .02, .06 - i * .12], { roughness: .92 });
        reed.rotation.z = (i ? 1 : -1) * .14;
      }
    }
  } else if (seed % 4 === 0) {
    for (let i = 0; i < 2; i += 1) {
      const pebble = addMesh(group, new THREE.DodecahedronGeometry(.055 + i * .025, 0), 0x756d55, [-.22 + i * .36, .15, .12 - i * .22], { roughness: .98 });
      pebble.rotation.y = i * 1.8;
    }
  }
  return group;
}

function meshIslandAtmosphere(viewMode) {
  // These are map-scale, non-selectable marks rather than another tile layer. They break up
  // the even simulation grid without inventing information in either causal view.
  const group = new THREE.Group(); group.name = 'island-atmosphere';
  const soil = viewMode === 'local' ? 0x5e6556 : 0x6d624b;
  for (let i = 0; i < 19; i += 1) {
    const angle = i * 2.3999632297; const radius = 3.2 + (i * 7.13 % 14.2);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.1 + (i % 4) * .42, 12), new THREE.MeshStandardMaterial({ color: soil, transparent: true, opacity: .11 + (i % 3) * .025, roughness: 1, depthWrite: false }));
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = angle * .64;
    patch.position.set(Math.cos(angle) * radius, .192, Math.sin(angle) * radius * .82);
    patch.renderOrder = 0; group.add(patch);
  }
  // The rock rim sits outside the selectable 32×32 board, so it cannot intercept an order click.
  for (let i = 0; i < 38; i += 1) {
    const angle = i / 38 * Math.PI * 2; const radius = 19.2 + ((i * 17) % 9) * .19; const size = .22 + ((i * 11) % 5) * .075;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material(i % 3 === 0 ? 0x45483f : 0x5b5949, { roughness: .98 }));
    rock.position.set(Math.cos(angle) * radius, .12 + size * .35, Math.sin(angle) * radius * .86);
    rock.scale.set(1.55, .55 + (i % 3) * .12, .95); rock.rotation.set(0, angle * 2.7, i * .37);
    rock.castShadow = true; rock.receiveShadow = true; group.add(rock);
  }
  const glintColor = viewMode === 'local' ? 0x74b8a7 : 0x8aa18c;
  for (let i = 0; i < 13; i += 1) {
    const angle = i * .91; const radius = 21.2 + (i % 4) * 1.05;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(.22 + (i % 3) * .08, 8), new THREE.MeshBasicMaterial({ color: glintColor, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false }));
    glint.rotation.x = -Math.PI / 2; glint.position.set(Math.cos(angle) * radius, -.145, Math.sin(angle) * radius * .78); glint.renderOrder = 1; group.add(glint);
  }
  return group;
}

function addFacilitySprite(group, type, textures) {
  const sprite = addSprite(group, textures[type], type);
  if (!sprite) return false;
  // These are authored as transparent, orthographic game objects. Three's Sprite keeps
  // the art legible as the player rotates the map while the plinth retains world scale.
  return true;
}

function meshBuilding(b, spriteTextures) {
  // Coordinates are part of selection data as well as rendering data. Earth must only
  // select received entities, so the raycast gate needs their observed location.
  const group = new THREE.Group(); group.userData = { id: b.id, kind: 'building', x: b.x, y: b.y };
  const footprint = BUILDINGS[b.type]?.footprint || [2, 2];
  const w = footprint[0] * 1.02; const d = footprint[1] * 1.02;
  const seed = [...String(b.id)].reduce((value, char) => value + char.charCodeAt(0), 0);
  // A dusty irregular contact patch grounds the installation without the old board-game plinth.
  addGroundBlend(group, w, d, seed);
  const hasSprite = addFacilitySprite(group, b.type, spriteTextures);
  if (!hasSprite && b.type === 'habitat') {
    addMesh(group, new THREE.BoxGeometry(1.78, .32, 1.62), 0x777667, [0, .34, 0]);
    for (let i = -1; i <= 1; i += 1) { const dome = addMesh(group, new THREE.SphereGeometry(.43, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9d4ba, [i * .5, .67, 0], { metalness: .2 }); dome.scale.y = .68; }
    addMesh(group, new THREE.BoxGeometry(.3, .4, .08), 0x324e51, [0, .48, -.83], { metalness: .45 });
  } else if (!hasSprite && b.type === 'relay') {
    addMesh(group, new THREE.CylinderGeometry(.18, .26, 1.55, 10), 0x827b68, [0, .92, 0], { metalness: .48 });
    const dish = addMesh(group, new THREE.ConeGeometry(.72, .2, 24, 1, true), 0xd9d4ba, [0, 1.75, 0], { side: THREE.DoubleSide, roughness: .45 }); dish.rotation.x = -.32;
    addMesh(group, new THREE.SphereGeometry(.11, 10, 8), 0x78b4aa, [0, 2.02, 0], { emissive: 0x1d6c68, emissiveIntensity: 2 });
  } else if (!hasSprite && b.type === 'solar') {
    for (const x of [-.47, .47]) for (const z of [-.35, .35]) { const panel = addMesh(group, new THREE.BoxGeometry(.78, .045, .54), 0x1d5968, [x, .64, z], { metalness: .7, roughness: .25 }); panel.rotation.z = x > 0 ? -.18 : .18; }
    for (const x of [-.47, .47]) addMesh(group, new THREE.CylinderGeometry(.035, .035, .54, 6), 0x686b61, [x, .34, 0], { metalness: .7 });
  } else if (!hasSprite && b.type === 'greenhouse') {
    addMesh(group, new THREE.BoxGeometry(2.72, .16, 1.65), 0x6a776d, [0, .28, 0]);
    const glass = addMesh(group, new THREE.BoxGeometry(2.58, .72, 1.46), 0x78b4aa, [0, .72, 0], { transparent: true, opacity: .52, roughness: .22, metalness: .08 });
    for (const z of [-.36, 0, .36]) addMesh(group, new THREE.BoxGeometry(2.3, .065, .09), 0x84b35e, [0, .43, z], { emissive: 0x153f28, emissiveIntensity: .65 });
    for (const x of [-1.05, -.52, 0, .52, 1.05]) addMesh(group, new THREE.BoxGeometry(.045, .78, 1.52), 0xd1c59d, [x, .73, 0], { metalness: .48, roughness: .4 });
    glass.renderOrder = 1;
  } else if (!hasSprite && b.type === 'reservoir') {
    addMesh(group, new THREE.CylinderGeometry(.86, .86, .25, 20), 0x53625d, [0, .3, 0]);
    addMesh(group, new THREE.CylinderGeometry(.72, .72, .06, 24), 0x4e9ba0, [0, .46, 0], { transparent: true, opacity: .9, metalness: .25 });
  } else if (!hasSprite && b.type === 'mine') {
    addMesh(group, new THREE.BoxGeometry(1.65, .5, 1.65), 0x716654, [0, .4, 0]);
    addMesh(group, new THREE.CylinderGeometry(.12, .22, 1.15, 10), 0x3c413e, [0, 1.02, 0], { metalness: .72 });
    addMesh(group, new THREE.ConeGeometry(.42, .52, 8), 0x4e5047, [.44, .55, .22]);
  } else if (!hasSprite && b.type === 'launch') {
    addMesh(group, new THREE.BoxGeometry(2.72, .22, 1.72), 0x695e4d, [0, .29, 0]);
    addMesh(group, new THREE.CylinderGeometry(.34, .48, .18, 20), 0x303b3d, [0, .49, 0], { metalness: .65 });
    for (const x of [-1.05, 1.05]) addMesh(group, new THREE.BoxGeometry(.13, .6, .13), 0xb78355, [x, .62, 0], { metalness: .3 });
    for (const x of [-.62, .62]) addMesh(group, new THREE.CylinderGeometry(.04, .055, 1.32, 7), 0xc29d63, [x, .96, -.48], { metalness: .65 });
  } else if (!hasSprite && b.type === 'workshop') {
    addMesh(group, new THREE.BoxGeometry(1.88, .9, .9), buildingColor.workshop, [0, .62, 0], { metalness: .22 });
    addMesh(group, new THREE.BoxGeometry(.85, .4, .04), 0x34484a, [0, .6, -.47], { metalness: .45 });
    addMesh(group, new THREE.CylinderGeometry(.12, .12, .48, 8), 0x4b4a43, [.65, 1.15, .15], { metalness: .5 });
  } else if (!hasSprite) {
    addMesh(group, new THREE.BoxGeometry(.82, .72, .82), buildingColor[b.type] || 0xd9d4ba, [0, .55, 0]);
  }
  if (hasSprite) addSpriteSiteDressing(group, b.type, seed, spriteTextures);
  else addUtilityDressing(group, w, d, seed);
  if (b.status === 'queued') group.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .32; } });
  const [wx, wz] = cell(b.x, b.y); group.position.set(wx, 0, wz); return group;
}
function robotSpriteKey(r) {
  if (r.type === 'construction') return 'vehicleConstruction';
  if (r.type === 'survey') return 'vehicleSurvey';
  if (r.type === 'cargo') return 'vehicleCargo';
  if (r.type === 'maintenance') return 'vehicleMaintenance';
  const choices = ['vehicleConstruction', 'vehicleSurvey', 'vehicleCargo', 'vehicleMaintenance'];
  return choices[[...String(r.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % choices.length];
}
function meshRobot(r, textures) {
  // Keep the current observed coordinates on the selectable parent, rather than
  // allowing its underlying transparent tile target to be the only eligible hit.
  const g = new THREE.Group(); g.userData = { id: r.id, kind: 'robot', x: r.x, y: r.y };
  const key = robotSpriteKey(r); const hasSprite = addSprite(g, textures[key], key, { y: .12, centerY: .12, order: 4 });
  const lifecycle = r.lifecycle || r.status;
  const role = lifecycle === 'en-route' || r.status === 'moving' ? 0x72d9ce : lifecycle === 'working' ? 0xf0c56b : r.type === 'construction' ? 0xd9a455 : r.type === 'survey' ? 0x5bb7c7 : r.type === 'cargo' ? 0xd17e47 : r.type === 'maintenance' ? 0x91bc72 : 0xc6b680;
  // A small role halo is intentionally visible from the default camera, so rovers don't read
  // as interchangeable decoration when the player is choosing a target.
  const halo = new THREE.Mesh(new THREE.RingGeometry(.33, .39, 16), new THREE.MeshBasicMaterial({ color: role, transparent: true, opacity: .82, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = .18; halo.renderOrder = 3; g.add(halo);
  const beacon = addMesh(g, new THREE.CylinderGeometry(.025, .045, .22, 7), role, [0, .49, 0], { emissive: role, emissiveIntensity: 1.8, roughness: .35 });
  beacon.castShadow = false;
  if (r.type === 'cargo' && lifecycle === 'working') addSprite(g, textures.vehiclePallet, 'vehiclePallet', { y: .52, centerY: .12, order: 5, scale: .62 });
  if (!hasSprite) {
    addMesh(g, new THREE.BoxGeometry(.68, .22, .48), 0xd9d4ba, [0, .25, 0], { metalness: .45, roughness: .48 });
    for (const x of [-.25, .25]) addMesh(g, new THREE.CylinderGeometry(.11, .11, .5, 10), 0x303634, [x, .14, 0], { metalness: .55 });
    addMesh(g, new THREE.CylinderGeometry(.055, .09, .38, 8), lifecycle === 'en-route' ? 0x72d9ce : lifecycle === 'working' ? 0xf0c56b : 0xb78355, [0, .55, 0], { metalness: .7, emissive: lifecycle === 'en-route' ? 0x164d4b : lifecycle === 'working' ? 0x6b4b16 : 0x000000 });
  }
  const [wx, wz] = cell(r.x, r.y); g.position.set(wx, 0, wz); g.userData.to = null; return g;
}
function lineBetween(ax, az, bx, bz, color, y = .3) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz)]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .65 });
  const line = new THREE.Line(geo, mat); line.renderOrder = 2; return line;
}

function meshBuildGhost(packet, spec, textures) {
  const group = new THREE.Group(); group.userData = { id: `${packet.id}-ghost`, kind: 'ghost' };
  const [w, d] = spec.footprint; const h = packet.payload.type === 'relay' ? 1.65 : .95;
  const footprint = addMesh(group, new THREE.BoxGeometry(w * 1.12, .03, d * 1.12), 0xd9b46b, [0, .16, 0], { transparent: true, opacity: .28, roughness: .55, emissive: 0x6b4213, emissiveIntensity: .55 });
  footprint.castShadow = false;
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.1, .07, d * 1.1)), new THREE.LineBasicMaterial({ color: 0xffd584, transparent: true, opacity: .95 }));
  outline.position.y = .21; outline.renderOrder = 5; group.add(outline);
  const scaffold = addSprite(group, textures.terrainScaffold, 'terrainScaffold', { y: .16, centerY: .12, order: 4 });
  if (!scaffold) {
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * .92, h, d * .92)), new THREE.LineBasicMaterial({ color: 0xe2b65d, transparent: true, opacity: .78 }));
    frame.position.y = .17 + h / 2; group.add(frame);
  }
  const uplink = new THREE.Mesh(new THREE.ConeGeometry(.13, .52, 4), new THREE.MeshBasicMaterial({ color: 0xffca6d, transparent: true, opacity: .9 }));
  uplink.position.y = 1.75; uplink.renderOrder = 5; group.add(uplink);
  const [wx, wz] = cell(packet.payload.x, packet.payload.y); group.position.set(wx + (w - 1) * .55, 0, wz + (d - 1) * .55);
  return group;
}

/** A local Earth-side drafting aid, not an observed colony object or a transmitted order. */
function meshOrderPreview(order, spec, textures) {
  const group = new THREE.Group(); group.name = 'earth-order-preview';
  const [w, d] = spec.footprint;
  const valid = order.valid !== false; const color = valid ? 0xb78035 : 0xb54d42;
  const edgeColor = valid ? 0xffcc74 : 0xff7a69;
  const surface = addMesh(group, new THREE.BoxGeometry(w * 1.08, .025, d * 1.08), color, [0, .15, 0], { transparent: true, opacity: .22, emissive: valid ? 0x6b4213 : 0x5d1714, emissiveIntensity: .5 });
  surface.castShadow = false;
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.08, .08, d * 1.08)), new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: .96 }));
  outline.position.y = .19; outline.renderOrder = 8; group.add(outline);
  const silhouette = addSprite(group, textures[order.type], order.type, { y: .17, centerY: .13, order: 7, color: valid ? 0xf0bd62 : 0xe67062 });
  if (silhouette) { silhouette.material = silhouette.material.clone(); silhouette.material.opacity = .42; silhouette.material.depthWrite = false; }
  const [wx, wz] = cell(order.x, order.y); group.position.set(wx + (w - 1) * .55, 0, wz + (d - 1) * .55);
  return group;
}

function selectionMarker(target, viewMode) {
  if (!target || target.x == null || target.y == null) return null;
  const group = new THREE.Group(); group.name = 'tactical-selection';
  const [wx, wz] = cell(target.x, target.y); group.position.set(wx, 0, wz);
  const color = viewMode === 'local' ? 0x73e2d0 : 0xffcc74;
  const outer = new THREE.Mesh(new THREE.RingGeometry(.47, .56, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .96, side: THREE.DoubleSide }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = .28; outer.renderOrder = 9; group.add(outer);
  const inner = new THREE.Mesh(new THREE.RingGeometry(.25, .285, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75, side: THREE.DoubleSide }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = .29; inner.renderOrder = 9; group.add(inner);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.018, .06, 1.3, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .34, side: THREE.DoubleSide }));
  beam.position.y = .94; beam.renderOrder = 8; group.add(beam);
  return group;
}

function viewBoundaryMarker(viewMode) {
  const group = new THREE.Group(); group.name = 'view-boundary';
  const color = viewMode === 'local' ? 0x54d9ca : 0xcba45c;
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, i) => {
    const angle = i / 48 * Math.PI * 2; return new THREE.Vector3(Math.cos(angle) * 17.5, .16, Math.sin(angle) * 17.5);
  })), new THREE.LineBasicMaterial({ color, transparent: true, opacity: viewMode === 'local' ? .5 : .22 }));
  ring.renderOrder = 1; group.add(ring);
  if (viewMode === 'local') {
    // Diagnostic sweep: it says "live local read-only" without touching Earth-side knowledge.
    const sweep = new THREE.Mesh(new THREE.RingGeometry(16.6, 17.2, 48, 1, -.2, 1.05), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .12, side: THREE.DoubleSide }));
    sweep.rotation.x = -Math.PI / 2; sweep.position.y = .15; sweep.renderOrder = 1; group.add(sweep);
  }
  return group;
}

export function ColonyScene({ state, onSelect, reducedMotion = false, rendererFactory = createColonyRenderer, viewMode = 'earth', readOnly = false, previewBuild = null }) {
  const host = useRef(null); const sceneRef = useRef(null);
  const latest = useRef({ state, onSelect, reducedMotion, viewMode, readOnly, previewBuild });
  latest.current = { state, onSelect, reducedMotion, viewMode, readOnly, previewBuild };
  const [glError, setGlError] = useState(null); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!host.current) return undefined;
    const el = host.current; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x283437); scene.fog = new THREE.Fog(0x283437, 38, 76);
    // Begin at a settlement-first RTS framing. The old wide shot exposed too much
    // empty island and made the authored facilities read like detached map icons.
    const camera = new THREE.OrthographicCamera(-19, 19, 14, -14, .1, 100); camera.zoom = 1.72;
    const focus = new THREE.Vector3(0, 0, 0); let azimuth = 0;
    const placeCamera = () => { const a = azimuth * Math.PI / 2 + Math.PI / 4; camera.position.set(focus.x + Math.cos(a) * 36, 34, focus.z + Math.sin(a) * 36); camera.lookAt(focus.x, 0, focus.z); };
    placeCamera();
    let renderer;
    try { renderer = rendererFactory(); }
    catch (error) { setGlError(error.message || String(error)); return undefined; }
    setGlError(null);
    renderer.domElement.className = 'colony-canvas';
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; el.appendChild(renderer.domElement);
    // Runtime sprites are deliberately separate images, not a baked colony screenshot: every
    // building still comes from received telemetry and remains independently selectable.
    const textureLoader = new THREE.TextureLoader(); const texturesByUrl = new Map(); const spriteTextures = {};
    const assetBase = /^https?:/.test(document.baseURI) ? document.baseURI : 'http://localhost/';
    const loadSprite = (type) => {
      if (spriteTextures[type]) return spriteTextures[type];
      const path = spriteUrls[type]; if (!path) return null;
      const url = new URL(path, assetBase).href;
      let texture = texturesByUrl.get(url);
      if (!texture) {
        texture = textureLoader.load(url, (loaded) => { loaded.colorSpace = THREE.SRGBColorSpace; renderer.render(scene, camera); });
        texture.colorSpace = THREE.SRGBColorSpace; texture.userData.persistentSceneTexture = true;
        texturesByUrl.set(url, texture);
      }
      spriteTextures[type] = texture;
      return texture;
    };
    // Keep the terrain's authored surface separate from the simulation cells.  The texture
    // gives the island broad mineral seams and fractured ground while the invisible cell
    // meshes retain exact, stable click targets for every simulation order.
    const regolithTexture = textureLoader.load(new URL(regolithTextureUrl, assetBase).href, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = THREE.RepeatWrapping; loaded.wrapT = THREE.RepeatWrapping;
      loaded.repeat.set(3.6, 3.6);
      loaded.anisotropy = Math.min(4, renderer.capabilities?.getMaxAnisotropy?.() || 1);
      renderer.render(scene, camera);
    });
    regolithTexture.colorSpace = THREE.SRGBColorSpace;
    regolithTexture.wrapS = THREE.RepeatWrapping; regolithTexture.wrapT = THREE.RepeatWrapping;
    regolithTexture.repeat.set(3.6, 3.6);
    regolithTexture.userData.persistentSceneTexture = true;
    texturesByUrl.set(regolithTexture.image?.src || new URL(regolithTextureUrl, assetBase).href, regolithTexture);
    // An authored ground plate gives the colony a world-scale coast and mineral geography.
    // It contains no structures; all buildings, roads, vehicles, and selection remain live data.
    const groundPlateTexture = textureLoader.load(new URL(groundPlateTextureUrl, assetBase).href, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = THREE.ClampToEdgeWrapping; loaded.wrapT = THREE.ClampToEdgeWrapping;
      renderer.render(scene, camera);
    });
    groundPlateTexture.colorSpace = THREE.SRGBColorSpace;
    groundPlateTexture.wrapS = THREE.ClampToEdgeWrapping; groundPlateTexture.wrapT = THREE.ClampToEdgeWrapping;
    groundPlateTexture.userData.persistentSceneTexture = true;
    texturesByUrl.set(groundPlateTexture.image?.src || new URL(groundPlateTextureUrl, assetBase).href, groundPlateTexture);
    const ambient = new THREE.HemisphereLight(0xffdec1, 0x243b3b, 2.15); scene.add(ambient); const sun = new THREE.DirectionalLight(0xffbd76, 4.2); sun.position.set(-18, 28, 14); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -24; sun.shadow.camera.right = 24; sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24; scene.add(sun); const fill = new THREE.DirectionalLight(0x62aaa1, .8); fill.position.set(20, 12, -18); scene.add(fill);
    const world = new THREE.Group(); scene.add(world); const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const observed = () => {
      const { state: current, viewMode: mode } = latest.current;
      if (mode === 'local') return { buildings: current.buildings.filter((b) => b.status !== 'cancelled'), robots: current.robots, roads: current.roads };
      const world = current.observedWorld || { buildings: [], robots: [], roads: [] };
      const surveyedTiles = new Set(current.observedKnowledge?.surveyedTiles || []);
      return {
        buildings: (world.buildings || []).filter((building) => receivedEntity(building, 'building', surveyedTiles)),
        robots: (world.robots || []).filter((robot) => receivedEntity(robot, 'robot', surveyedTiles)),
        roads: (world.roads || []).filter((road) => receivedEntity(road, 'road', surveyedTiles)),
      };
    };
    const surveyed = () => {
      const { state: current, viewMode: mode } = latest.current;
      return new Set((mode === 'local' ? current.localKnowledge : current.observedKnowledge)?.surveyedTiles || []);
    };
    let tacticalSelection = null;
    // The simulation advances in discrete days (and can advance several days per visual
    // tick). Retaining a render-side rover position turns those canonical tile steps into
    // a visible drive; game state, telemetry, and selectable tile coordinates stay exact.
    const roverMotion = new Map();
    let previousFrameAt = performance.now();

    const renderWorld = () => {
      const { state } = latest.current;
      const obs = observed();
      const surveyedTiles = surveyed();
      const neededSprites = new Set(['terrainRock', 'terrainWetland', 'terrainRoadSignal']);
      for (const b of (obs.buildings || [])) neededSprites.add(b.type);
      for (const r of (obs.robots || [])) neededSprites.add(robotSpriteKey(r));
      if (latest.current.viewMode === 'earth' && latest.current.previewBuild?.type) neededSprites.add(latest.current.previewBuild.type);
      if ((obs.buildings || []).length) { neededSprites.add('terrainCrates'); neededSprites.add('vehiclePallet'); }
      if (latest.current.viewMode === 'earth' && state.packets.some((p) => p.direction === 'uplink' && p.status === 'in-transit' && p.kind === 'build-order')) neededSprites.add('terrainScaffold');
      neededSprites.forEach(loadSprite);
      disposeObjectTree(world);
      const floodKeys = new Set(state.floodKeys || []);
      const observedRoadKeys = new Set((obs.roads || []).map((r) => `${r.x},${r.y}`));
      // An irregular shelf keeps the logical 32×32 grid from reading as a literal board.
      // It is scenery only: the transparent tile meshes above remain the authoritative
      // selectable world and retain their exact simulation coordinates.
      const water = new THREE.Mesh(new THREE.CircleGeometry(31, 64), material(0x214d4b, { roughness: .46, metalness: .3 }));
      water.rotation.x = -Math.PI / 2; water.position.y = -.2; water.receiveShadow = true; world.add(water);
      const shallow = new THREE.Mesh(new THREE.RingGeometry(22.1, 28.6, 64), new THREE.MeshStandardMaterial({ color: 0x46766c, transparent: true, opacity: .42, roughness: .42, metalness: .16, side: THREE.DoubleSide }));
      shallow.rotation.x = -Math.PI / 2; shallow.position.y = -.165; shallow.renderOrder = 0; world.add(shallow);
      const coast = [
        [-22, -8], [-18, -18], [-7, -22], [8, -21], [19, -16], [22, -5],
        [21, 9], [16, 20], [5, 22], [-10, 21], [-20, 16], [-22, 5],
      ];
      const island = new THREE.Shape(); island.moveTo(...coast[0]);
      for (const point of coast.slice(1)) island.lineTo(...point);
      island.closePath();
      const landGeometry = normalizeIslandUVs(new THREE.ExtrudeGeometry(island, { depth: .22, bevelEnabled: false }));
      landGeometry.rotateX(-Math.PI / 2);
      const land = new THREE.Mesh(landGeometry, material(0xf2dcc0, {
        map: groundPlateTexture,
        roughness: .94,
        metalness: .02,
      }));
      land.position.y = -.04; land.receiveShadow = true; world.add(land);
      world.add(meshIslandAtmosphere(latest.current.viewMode));
      world.add(viewBoundaryMarker(latest.current.viewMode));
      for (const t of state.tiles) {
        const pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, .1, 1.1), pickMaterial);
        const [wx, wz] = cell(t.x, t.y); m.position.set(wx, .08, wz);
        m.userData = tileData(t.x, t.y); world.add(m);
        const visible = surveyedTiles.has(`${t.x},${t.y}`);
        if (visible && !observedRoadKeys.has(`${t.x},${t.y}`)) world.add(meshTerrainDetail(t, m.userData, spriteTextures));
        // Flood-risk contour: the old map showed seasonal floodplains; the briefing warned about them.
        if (visible && floodKeys.has(`${t.x},${t.y}`)) {
          const contour = new THREE.Mesh(new THREE.BoxGeometry(1.04, .06, 1.04), new THREE.MeshBasicMaterial({ color: 0xd9b46b, transparent: true, opacity: .18, wireframe: true }));
          contour.position.set(wx, .13, wz); contour.userData = m.userData; world.add(contour);
        }
        if (!visible) {
          const fog = new THREE.Mesh(new THREE.BoxGeometry(1.08, .09, 1.08), new THREE.MeshBasicMaterial({ color: 0x111817, transparent: true, opacity: .9 }));
          fog.position.set(wx, .16, wz); fog.userData = m.userData; world.add(fog);
        }
      }
      // Roads and connectivity are derived solely from received telemetry. A local relay
      // that Earth has not observed cannot brighten a road or otherwise reveal itself.
      const observedState = { buildings: obs.buildings || [], roads: obs.roads || [] };
      const { components } = gridComponents(observedState);
      const relay = (obs.buildings || []).find((b) => b.type === 'relay');
      const relayComp = relay ? components.get(`${relay.x},${relay.y}`) : null;
      for (const r of (obs.roads || [])) world.add(meshRoad(r, observedRoadKeys, components.get(`${r.x},${r.y}`) === relayComp, spriteTextures));
      const seenRovers = new Set();
      for (const r of (obs.robots || [])) {
        const [targetX, targetZ] = cell(r.x, r.y);
        const motion = roverMotion.get(r.id) || { x: targetX, z: targetZ, targetX, targetZ };
        motion.targetX = targetX; motion.targetZ = targetZ;
        roverMotion.set(r.id, motion); seenRovers.add(r.id);
        const rover = meshRobot(r, spriteTextures);
        rover.position.set(motion.x, 0, motion.z);
        rover.userData.motion = motion;
        world.add(rover);
      }
      for (const id of roverMotion.keys()) if (!seenRovers.has(id)) roverMotion.delete(id);
      if (latest.current.viewMode === 'local') {
        for (const j of state.jobs.filter((job) => ['queued', 'active'].includes(job.status) && job.target)) {
          const rover = (obs.robots || []).find((robot) => robot.id === j.robotId);
          if (!rover) continue;
          const [fromX, fromZ] = cell(rover.x, rover.y); const [toX, toZ] = cell(j.target.x, j.target.y);
          world.add(lineBetween(fromX, fromZ, toX, toZ, j.type === 'cargo' ? 0xd17e47 : 0x72d9ce, .38));
        }
      }
      for (const b of (obs.buildings || [])) world.add(meshBuilding({ ...b, status: b.status || 'complete', health: b.health ?? 100, level: 0, origin: latest.current.viewMode }, spriteTextures));
      if (latest.current.viewMode === 'earth' && latest.current.previewBuild) {
        const { type } = latest.current.previewBuild; const spec = BUILDINGS[type];
        if (spec) world.add(meshOrderPreview(latest.current.previewBuild, spec, spriteTextures));
      }
      // Amber ghosts: Earth's own in-transit orders (builds and road corridors) are the only
      // things beyond the received world that the player is entitled to see.
      for (const p of latest.current.viewMode === 'earth' ? state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'build-order') : []) {
        const spec = BUILDINGS[p.payload.type]; if (!spec) continue;
        world.add(meshBuildGhost(p, spec, spriteTextures));
      }
      for (const p of latest.current.viewMode === 'earth' ? state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'road-order') : []) {
        const path = p.payload?.path || [];
        for (let i = 1; i < path.length; i += 1) {
          const a = Array.isArray(path[i - 1]) ? path[i - 1] : [path[i - 1].x, path[i - 1].y];
          const b = Array.isArray(path[i]) ? path[i] : [path[i].x, path[i].y];
          const [ax, az] = cell(a[0], a[1]); const [bx, bz] = cell(b[0], b[1]);
          world.add(lineBetween(ax, az, bx, bz, 0xd9b46b, .18));
        }
      }
      // Literal Earth rover commands are visible as an amber intent vector, not as a
      // premature robot move. The rover stays at its last received position until
      // a later telemetry packet reaches Earth.
      for (const p of latest.current.viewMode === 'earth' ? state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'robot-move') : []) {
        const rover = (obs.robots || []).find((robot) => robot.id === p.payload.robotId);
        if (!rover) continue;
        const [fromX, fromZ] = cell(rover.x, rover.y); const [toX, toZ] = cell(p.payload.x, p.payload.y);
        const vector = lineBetween(fromX, fromZ, toX, toZ, 0xd9b46b, .36); vector.name = 'earth-move-vector'; world.add(vector);
        const target = new THREE.Mesh(new THREE.RingGeometry(.34, .43, 16), new THREE.MeshBasicMaterial({ color: 0xd9b46b, transparent: true, opacity: .78, side: THREE.DoubleSide }));
        target.rotation.x = -Math.PI / 2; target.position.set(toX, .23, toZ); target.renderOrder = 6; world.add(target);
      }
      const marker = tacticalSelection && (latest.current.viewMode === 'local' || surveyedCell(surveyedTiles, tacticalSelection.x, tacticalSelection.y))
        ? selectionMarker(tacticalSelection, latest.current.viewMode) : null;
      if (marker) world.add(marker);
    };
    renderWorld();

    // Minimap: 2D overview with click-to-center panning.
    const mm = document.createElement('canvas'); mm.className = 'minimap'; mm.width = 150; mm.height = 150; const mctx = mm.getContext('2d'); el.appendChild(mm);
    const drawMinimap = () => {
      if (!mctx) return;
      const { state } = latest.current;
      const obs = observed();
      const surveyedTiles = surveyed();
      const s = 150 / 32; mctx.clearRect(0, 0, 150, 150);
      for (const t of state.tiles) { mctx.fillStyle = surveyedTiles.has(`${t.x},${t.y}`) && palette[t.terrain] != null ? `#${palette[t.terrain].toString(16).padStart(6, '0')}` : '#101716'; mctx.fillRect(t.x * s, t.y * s, s + .4, s + .4); }
      for (const r of (obs.roads || [])) { mctx.fillStyle = '#8a7f66'; mctx.fillRect(r.x * s, r.y * s, s + .4, s + .4); }
      for (const b of (obs.buildings || [])) { mctx.fillStyle = '#e8e2c8'; mctx.fillRect(b.x * s, b.y * s, (s + .4) * (b.type === 'greenhouse' || b.type === 'launch' ? 3 : 2), (s + .4) * 2); }
      for (const r of (obs.robots || [])) { mctx.fillStyle = '#d98f4e'; mctx.beginPath(); mctx.arc((r.x + .5) * s, (r.y + .5) * s, 2.2, 0, Math.PI * 2); mctx.fill(); }
      if (latest.current.viewMode === 'earth') for (const p of state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'build-order')) { const spec = BUILDINGS[p.payload.type]; if (!spec) continue; mctx.strokeStyle = '#d9b46b'; mctx.strokeRect(p.payload.x * s, p.payload.y * s, (s + .4) * spec.footprint[0], (s + .4) * spec.footprint[1]); }
    };
    drawMinimap();
    const mmClick = (e) => {
      const rect = mm.getBoundingClientRect(); const s = 150 / 32;
      const tx = Math.floor((e.clientX - rect.left) / rect.width * 150 / s); const ty = Math.floor((e.clientY - rect.top) / rect.height * 150 / s);
      if (tx < 0 || ty < 0 || tx >= 32 || ty >= 32) return;
      const [wx, wz] = cell(tx, ty); focus.set(wx, 0, wz); placeCamera(); resize();
    };
    mm.addEventListener('click', mmClick);

    const resize = () => { const w = el.clientWidth || 800, h = el.clientHeight || 500, aspect = w / h; camera.left = -18 * aspect; camera.right = 18 * aspect; camera.top = 18; camera.bottom = -18; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); renderer.render(scene, camera); }; resize(); window.addEventListener('resize', resize);
    const click = (e) => {
      if (latest.current.readOnly) return;
      const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera);
      // Skip decorative/selection meshes. A tile's transparent pick box spans the whole
      // cell and otherwise wins the distance-sorted raycast over a rover or facility
      // standing on it, which made units impossible to inspect. Prefer actual entities;
      // fall back to the tile only when the click did not land on one.
      const priority = { building: 3, robot: 2, tile: 1 };
      const selectable = raycaster.intersectObjects(world.children, true).map((hit) => {
        let obj = hit.object; while (obj.parent && !obj.userData.id) obj = obj.parent; return obj.userData.id ? obj : null;
      }).filter(Boolean)
        .filter((object) => priority[object.userData.kind] && (latest.current.viewMode === 'local' || surveyedCell(surveyed(), object.userData.x, object.userData.y)))
        .sort((a, b) => priority[b.userData.kind] - priority[a.userData.kind])[0];
      if (selectable) {
        tacticalSelection = selectable.userData;
        renderWorld(); drawMinimap(); resize();
        latest.current.onSelect?.(selectable.userData);
      }
    };
    const wheel = (e) => { camera.zoom = Math.max(.7, Math.min(2.3, camera.zoom - e.deltaY * .001)); camera.updateProjectionMatrix(); resize(); };
    const key = (e) => { if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return; if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') { azimuth += e.key.toLowerCase() === 'q' ? -1 : 1; placeCamera(); resize(); } };
    renderer.domElement.addEventListener('click', click); renderer.domElement.addEventListener('wheel', wheel, { passive: true }); window.addEventListener('keydown', key);
    let contextLost = false;
    const lost = (event) => { event.preventDefault(); contextLost = true; setGlError('The browser lost the WebGL 2 context. Close duplicate game tabs and retry the 3D view.'); };
    const restored = () => { contextLost = false; setGlError(null); resize(); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    renderer.domElement.addEventListener('webglcontextrestored', restored);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(el);
    let raf; const animate = () => { raf = requestAnimationFrame(animate);
      if (contextLost) return;
      if (!latest.current.reducedMotion) {
        const now = performance.now(); const delta = Math.min(.08, Math.max(.001, (now - previousFrameAt) / 1000)); previousFrameAt = now;
        // This remains smooth at 10x, where the next local tile can be committed every
        // 100 ms; a rover follows its newest target rather than snapping between days.
        const follow = 1 - Math.exp(-delta * 5.6);
        for (const group of world.children.filter((x) => x.userData.kind === 'robot')) {
          const motion = group.userData.motion;
          if (!motion) continue;
          motion.x += (motion.targetX - motion.x) * follow;
          motion.z += (motion.targetZ - motion.z) * follow;
          group.position.set(motion.x, .025 + Math.sin(now * .008 + motion.targetX) * .018, motion.z);
          const dx = motion.targetX - motion.x; const dz = motion.targetZ - motion.z;
          if (Math.hypot(dx, dz) > .025) group.rotation.y = Math.atan2(dx, dz) * .08;
        }
        const marker = world.getObjectByName('tactical-selection');
        if (marker) { const phase = performance.now() * .003; marker.children[0].scale.setScalar(1 + Math.sin(phase) * .08); marker.children[1].rotation.z -= .03; }
      }
      renderer.render(scene, camera); };
    animate(); let renderedState = latest.current.state; let renderedViewMode = latest.current.viewMode; let renderedPreview = latest.current.previewBuild;
    sceneRef.current = { scene, renderer, update: () => { if (renderedState === latest.current.state && renderedViewMode === latest.current.viewMode && renderedPreview === latest.current.previewBuild) return; renderedState = latest.current.state; renderedViewMode = latest.current.viewMode; renderedPreview = latest.current.previewBuild; renderWorld(); drawMinimap(); if (!contextLost) resize(); } };
    return () => { cancelAnimationFrame(raf); observer?.disconnect(); mm.removeEventListener('click', mmClick); mm.remove(); renderer.domElement.removeEventListener('click', click); renderer.domElement.removeEventListener('wheel', wheel); renderer.domElement.removeEventListener('webglcontextlost', lost); renderer.domElement.removeEventListener('webglcontextrestored', restored); window.removeEventListener('resize', resize); window.removeEventListener('keydown', key); disposeObjectTree(scene); texturesByUrl.forEach((texture) => texture.dispose()); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); sceneRef.current = null; };
  }, [retry, rendererFactory]);
  useEffect(() => { sceneRef.current?.update(); }, [state, viewMode, previewBuild]);
  return <><div className="scene-shell" ref={host} aria-label="Isometric colony map" />{glError && <div className="scene-fallback" role="alert"><strong>3D view unavailable</strong><p>The browser could not keep a WebGL 2 renderer running. Close duplicate game tabs, then retry. Your colony save is unchanged.</p><button className="primary" onClick={() => { setGlError(null); setRetry((value) => value + 1); }}>Retry 3D view</button><details><summary>Graphics error details</summary><pre>{glError}</pre></details></div>}</>;
}
