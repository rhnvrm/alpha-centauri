import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BUILDINGS } from '../game/constants.js';
import { gridComponents } from '../game/networks.js';
import { createColonyRenderer, disposeObjectTree } from './renderer.js';

const palette = { regolith: 0x978d69, rock: 0x5d6258, wetland: 0x3f756c };
const buildingColor = { relay: 0xd9d4ba, habitat: 0xc8c3ac, solar: 0x477e8b, greenhouse: 0x78b4aa, reservoir: 0x3e7880, workshop: 0xb78355, mine: 0x88725b, launch: 0xb78355 };
const cell = (x, y) => [ (x - 16) * 1.1, (y - 16) * 1.1 ];

function meshBuilding(b) {
  const group = new THREE.Group(); group.userData = { id: b.id, kind: 'building' };
  const w = b.type === 'greenhouse' || b.type === 'launch' ? 3 : b.type === 'workshop' ? 2 : 2; const h = b.type === 'relay' ? 1.5 : 0.85;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w * .9, h, 1.55), new THREE.MeshStandardMaterial({ color: buildingColor[b.type] || 0xd9d4ba, roughness: .78, metalness: .16 })); body.position.y = h / 2 + .12; body.castShadow = true; body.receiveShadow = true; group.add(body);
  if (b.type === 'habitat') { for (let i = -1; i <= 1; i += 1) { const dome = new THREE.Mesh(new THREE.SphereGeometry(.52, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9d4ba, roughness: .7, metalness: .12 })); dome.position.set(i * .55, .95, 0); dome.scale.y = .55; group.add(dome); } }
  if (b.type === 'relay') { const dish = new THREE.Mesh(new THREE.ConeGeometry(.78, .22, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd9d4ba, side: THREE.DoubleSide, roughness: .55 })); dish.rotation.x = -.35; dish.position.y = 2.0; group.add(dish); const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, .9, 8), new THREE.MeshStandardMaterial({ color: 0xb78355, metalness: .7 })); mast.position.y = 1.45; group.add(mast); const beacon = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0x78b4aa, emissive: 0x1d6c68, emissiveIntensity: 1.8 })); beacon.position.y = 2.2; group.add(beacon); }
  if (b.type === 'solar') { for (const x of [-.52, .52]) { for (const z of [-.34, .34]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(.8, .04, .54), new THREE.MeshStandardMaterial({ color: 0x1e6572, metalness: .55, roughness: .3 })); panel.position.set(x, .9, z); panel.rotation.z = x > 0 ? -.18 : .18; group.add(panel); } } }
  if (b.type === 'greenhouse') { const glass = new THREE.Mesh(new THREE.BoxGeometry(2.45, .7, 1.3), new THREE.MeshPhysicalMaterial({ color: 0x78b4aa, transparent: true, opacity: .58, roughness: .3 })); glass.position.y = .75; group.add(glass); for (const z of [-.32, 0, .32]) { const crops = new THREE.Mesh(new THREE.BoxGeometry(2.15, .07, .08), new THREE.MeshStandardMaterial({ color: 0x84b35e, emissive: 0x153f28, emissiveIntensity: .5 })); crops.position.set(0, .42, z); group.add(crops); } }
  if (b.type === 'reservoir') { const water = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, .08, 20), new THREE.MeshStandardMaterial({ color: 0x4e9ba0, transparent: true, opacity: .9 })); water.position.y = .9; group.add(water); }
  if (b.type === 'mine') { const mast = new THREE.Mesh(new THREE.CylinderGeometry(.2, .35, 1, 8), new THREE.MeshStandardMaterial({ color: 0x3c413e, metalness: .7 })); mast.position.y = 1; group.add(mast); }
  if (b.status === 'queued') group.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .32; } });
  const [wx, wz] = cell(b.x, b.y); group.position.set(wx, 0, wz); return group;
}
function meshRobot(r) {
  const g = new THREE.Group(); g.userData = { id: r.id, kind: 'robot' };
  const base = new THREE.Mesh(new THREE.BoxGeometry(.68, .25, .5), new THREE.MeshStandardMaterial({ color: 0xd9d4ba, metalness: .4, roughness: .55 })); base.position.y = .25; base.castShadow = true; g.add(base);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.06, .1, .38, 8), new THREE.MeshStandardMaterial({ color: r.status === 'assigned' ? 0x78b4aa : 0xb78355, metalness: .7 })); mast.position.y = .52; g.add(mast);
  const [wx, wz] = cell(r.x, r.y); g.position.set(wx, 0, wz); g.userData.to = null; return g;
}
function lineBetween(ax, az, bx, bz, color, y = .3) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz)]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .65 });
  const line = new THREE.Line(geo, mat); line.renderOrder = 2; return line;
}

export function ColonyScene({ state, onSelect, reducedMotion = false, rendererFactory = createColonyRenderer }) {
  const host = useRef(null); const sceneRef = useRef(null);
  const latest = useRef({ state, onSelect, reducedMotion });
  latest.current = { state, onSelect, reducedMotion };
  const [glError, setGlError] = useState(null); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!host.current) return undefined;
    const el = host.current; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x24332d); scene.fog = new THREE.Fog(0x24332d, 42, 78);
    const camera = new THREE.OrthographicCamera(-19, 19, 14, -14, .1, 100);
    const focus = new THREE.Vector3(0, 0, 0); let azimuth = 0;
    const placeCamera = () => { const a = azimuth * Math.PI / 2 + Math.PI / 4; camera.position.set(focus.x + Math.cos(a) * 36, 34, focus.z + Math.sin(a) * 36); camera.lookAt(focus.x, 0, focus.z); };
    placeCamera();
    let renderer;
    try { renderer = rendererFactory(); }
    catch (error) { setGlError(error.message || String(error)); return undefined; }
    setGlError(null);
    renderer.domElement.className = 'colony-canvas';
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; el.appendChild(renderer.domElement);
    const ambient = new THREE.HemisphereLight(0xd8e4d2, 0x2c4037, 2.25); scene.add(ambient); const sun = new THREE.DirectionalLight(0xffd59d, 3.8); sun.position.set(-18, 28, 14); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun); const fill = new THREE.DirectionalLight(0x78b4aa, .7); fill.position.set(20, 12, -18); scene.add(fill);
    const world = new THREE.Group(); scene.add(world); const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const observed = () => latest.current.state.observedWorld || { buildings: [], robots: [], roads: [] };

    const renderWorld = () => {
      const { state } = latest.current;
      disposeObjectTree(world);
      const obs = observed();
      const floodKeys = new Set(state.floodKeys || []);
      for (const t of state.tiles) {
        const color = new THREE.Color(palette[t.terrain] || palette.regolith); color.offsetHSL(0, 0, (((t.x * 17 + t.y * 11) % 7) - 3) * .012);
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.06, .12 + (t.terrain === 'rock' ? .18 : 0), 1.06), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
        const [wx, wz] = cell(t.x, t.y); m.position.set(wx, t.terrain === 'rock' ? .12 : 0, wz); m.receiveShadow = true;
        m.userData = { id: `tile-${t.x}-${t.y}`, kind: 'tile', x: t.x, y: t.y }; world.add(m);
        if (t.terrain === 'wetland' && (t.x + t.y) % 2 === 0) {
          const native = new THREE.Group();
          const stem = new THREE.Mesh(new THREE.ConeGeometry(.11, .48, 5), new THREE.MeshStandardMaterial({ color: 0x27554c, roughness: .9 })); stem.position.y = .34; native.add(stem);
          const crown = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6da58b, roughness: .8 })); crown.position.y = .58; native.add(crown);
          native.position.set(wx + .18, .08, wz - .14); world.add(native);
        }
        // Flood-risk contour: the old map showed seasonal floodplains; the briefing warned about them.
        if (floodKeys.has(`${t.x},${t.y}`)) {
          const contour = new THREE.Mesh(new THREE.BoxGeometry(1.04, .06, 1.04), new THREE.MeshBasicMaterial({ color: 0xd9b46b, transparent: true, opacity: .18, wireframe: true }));
          contour.position.set(wx, .13, wz); world.add(contour);
        }
      }
      // Roads Earth has actually seen (received telemetry), tinted when on the relay grid.
      const { components } = gridComponents(state);
      const relay = state.buildings.find((b) => b.type === 'relay');
      const relayComp = relay ? components.get(`${relay.x},${relay.y}`) : null;
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x9a8a66, roughness: 1 });
      const roadMatLive = new THREE.MeshStandardMaterial({ color: 0x5f8f86, roughness: 1 });
      for (const r of (obs.roads || [])) { const [wx, wz] = cell(r.x, r.y); const m = new THREE.Mesh(new THREE.BoxGeometry(.72, .05, .72), components.get(`${r.x},${r.y}`) === relayComp ? roadMatLive : roadMat); m.position.set(wx, .1, wz); world.add(m); }
      for (const r of (obs.robots || [])) world.add(meshRobot(r));
      for (const b of (obs.buildings || [])) world.add(meshBuilding({ ...b, status: 'complete', health: b.health ?? 100, level: 0, origin: 'observed' }));
      // Amber ghosts: Earth's own in-transit orders (builds and road corridors) are the only
      // things beyond the received world that the player is entitled to see.
      for (const p of state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'build-order')) {
        const spec = BUILDINGS[p.payload.type]; if (!spec) continue;
        const ghost = new THREE.Mesh(new THREE.BoxGeometry(spec.footprint[0] * .92, .05, spec.footprint[1] * .92), new THREE.MeshBasicMaterial({ color: 0xd9b46b, transparent: true, opacity: .5, wireframe: true }));
        const [wx, wz] = cell(p.payload.x, p.payload.y); ghost.position.set(wx + (spec.footprint[0] - 1) * .55, .16, wz + (spec.footprint[1] - 1) * .55);
        ghost.userData = { id: `${p.id}-ghost`, kind: 'ghost' }; world.add(ghost);
      }
      for (const p of state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'road-order')) {
        const path = p.payload?.path || [];
        for (let i = 1; i < path.length; i += 1) {
          const a = Array.isArray(path[i - 1]) ? path[i - 1] : [path[i - 1].x, path[i - 1].y];
          const b = Array.isArray(path[i]) ? path[i] : [path[i].x, path[i].y];
          const [ax, az] = cell(a[0], a[1]); const [bx, bz] = cell(b[0], b[1]);
          world.add(lineBetween(ax, az, bx, bz, 0xd9b46b, .18));
        }
      }
    };
    renderWorld();

    // Minimap: 2D overview with click-to-center panning.
    const mm = document.createElement('canvas'); mm.className = 'minimap'; mm.width = 150; mm.height = 150; const mctx = mm.getContext('2d'); el.appendChild(mm);
    const drawMinimap = () => {
      if (!mctx) return;
      const { state } = latest.current;
      const obs = observed();
      const s = 150 / 32; mctx.clearRect(0, 0, 150, 150);
      for (const t of state.tiles) { mctx.fillStyle = palette[t.terrain] != null ? `#${palette[t.terrain].toString(16).padStart(6, '0')}` : '#3b433e'; mctx.fillRect(t.x * s, t.y * s, s + .4, s + .4); }
      for (const r of (obs.roads || [])) { mctx.fillStyle = '#8a7f66'; mctx.fillRect(r.x * s, r.y * s, s + .4, s + .4); }
      for (const b of (obs.buildings || [])) { mctx.fillStyle = '#e8e2c8'; mctx.fillRect(b.x * s, b.y * s, (s + .4) * (b.type === 'greenhouse' || b.type === 'launch' ? 3 : 2), (s + .4) * 2); }
      for (const r of (obs.robots || [])) { mctx.fillStyle = '#d98f4e'; mctx.beginPath(); mctx.arc((r.x + .5) * s, (r.y + .5) * s, 2.2, 0, Math.PI * 2); mctx.fill(); }
      for (const p of state.packets.filter((x) => x.direction === 'uplink' && x.status === 'in-transit' && x.kind === 'build-order')) { const spec = BUILDINGS[p.payload.type]; if (!spec) continue; mctx.strokeStyle = '#d9b46b'; mctx.strokeRect(p.payload.x * s, p.payload.y * s, (s + .4) * spec.footprint[0], (s + .4) * spec.footprint[1]); }
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
    const click = (e) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(world.children, true)[0]; if (hit) { let obj = hit.object; while (obj.parent && !obj.userData.id) obj = obj.parent; if (obj.userData.id) latest.current.onSelect?.(obj.userData); } };
    const wheel = (e) => { camera.zoom = Math.max(.55, Math.min(1.8, camera.zoom - e.deltaY * .001)); camera.updateProjectionMatrix(); resize(); };
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
      if (!latest.current.reducedMotion) { const obs = observed(); for (const r of (obs.robots || [])) { const group = world.children.find((x) => x.userData.kind === 'robot' && x.userData.id === r.id); if (group) group.rotation.y += .004; } }
      renderer.render(scene, camera); };
    animate(); let renderedState = latest.current.state;
    sceneRef.current = { scene, renderer, update: () => { if (renderedState === latest.current.state) return; renderedState = latest.current.state; renderWorld(); drawMinimap(); if (!contextLost) resize(); } };
    return () => { cancelAnimationFrame(raf); observer?.disconnect(); mm.removeEventListener('click', mmClick); mm.remove(); renderer.domElement.removeEventListener('click', click); renderer.domElement.removeEventListener('wheel', wheel); renderer.domElement.removeEventListener('webglcontextlost', lost); renderer.domElement.removeEventListener('webglcontextrestored', restored); window.removeEventListener('resize', resize); window.removeEventListener('keydown', key); disposeObjectTree(scene); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); sceneRef.current = null; };
  }, [retry, rendererFactory]);
  useEffect(() => { sceneRef.current?.update(); }, [state]);
  return <><div className="scene-shell" ref={host} aria-label="Isometric colony map" />{glError && <div className="scene-fallback" role="alert"><strong>3D view unavailable</strong><p>The browser could not keep a WebGL 2 renderer running. Close duplicate game tabs, then retry. Your colony save is unchanged.</p><button className="primary" onClick={() => { setGlError(null); setRetry((value) => value + 1); }}>Retry 3D view</button><details><summary>Graphics error details</summary><pre>{glError}</pre></details></div>}</>;
}
