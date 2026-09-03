// Component lifecycle tests in an isolated DOM, not a live GPU/browser acceptance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { transformWithEsbuild } from 'vite';
import { createGame } from '../src/game/state.js';

const sourceURL = new URL('../src/scene/ColonyScene.jsx', import.meta.url);
const { code } = await transformWithEsbuild(await readFile(sourceURL, 'utf8'), sourceURL.pathname, { loader: 'jsx', format: 'esm' });
const resolved = code.replace(/from "([^"]+)"/g, (_, specifier) => `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, sourceURL).href : import.meta.resolve(specifier))}`);
const { ColonyScene } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

async function setup(t) {
  const dom = new JSDOM('<div id="root"></div>');
  const original = new Map(); const frames = new Map(); let frame = 0;
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback) => { frames.set(++frame, callback); return frame; },
    cancelAnimationFrame: (id) => frames.delete(id) };
  for (const [key, value] of Object.entries(globals)) { original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {} });
  const style = dom.window.document.createElement('style'); style.textContent = styles; dom.window.document.head.appendChild(style);
  const root = createRoot(dom.window.document.getElementById('root'));
  const renderers = [];
  const factory = () => {
    const renderer = { domElement: dom.window.document.createElement('canvas'), shadowMap: {}, disposed: 0, released: 0,
      setPixelRatio() {}, setSize() {}, render(scene, camera) { this.scene = scene; this.camera = camera; },
      dispose() { this.disposed++; }, forceContextLoss() { this.released++; } };
    renderers.push(renderer); return renderer;
  };
  t.after(async () => {
    await act(async () => root.unmount());
    assert.equal(frames.size, 0, 'no animation loop remains after unmount');
    dom.window.close();
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  return { dom, root, renderers, factory };
}

test('one WebGL renderer survives callback, state, and reduced-motion changes', async (t) => {
  const { dom, root, renderers, factory } = await setup(t);
  let state = createGame();
  const render = (reducedMotion = false) => act(async () => root.render(React.createElement(ColonyScene, { state, onSelect: () => {}, reducedMotion, rendererFactory: factory })));
  await render();
  const renderer = renderers[0]; const canvas = renderer.domElement;
  const world = renderer.scene.children.find((object) => object.isGroup);
  let disposed = 0; world.children[0].geometry.addEventListener('dispose', () => disposed++);
  renderer.camera.zoom = 1.4;
  for (let i = 0; i < 10; i++) await render(); // New inline callback on each keystroke.
  assert.equal(disposed, 0, 'typing does not rebuild world geometry');
  state = { ...state, localDay: 1, observedWorld: { ...state.observedWorld, buildings: state.observedWorld.buildings.slice(0, 1) } };
  await render(true);
  assert.equal(renderers.length, 1);
  assert.equal(document.querySelector('.colony-canvas'), canvas);
  const minimap = dom.window.getComputedStyle(document.querySelector('.minimap'));
  assert.equal(minimap.width, '150px'); assert.equal(minimap.height, '150px');
  assert.equal(renderer.camera.zoom, 1.4, 'camera survives state updates');
  assert.equal(disposed, 1, 'superseded geometry is disposed');
  assert.equal(world.children.filter((object) => object.userData.kind === 'building').length, 1, 'received world is updated');
  await act(async () => root.unmount());
  assert.equal(renderer.disposed, 1); assert.equal(renderer.released, 1);
});

test('local scene data is rendered only by the explicit read-only superposition mode', async (t) => {
  const { root, renderers, factory } = await setup(t);
  const base = createGame();
  const state = {
    ...base,
    buildings: [...base.buildings, { id: 'local-only-hab', type: 'habitat', x: 25, y: 25, status: 'complete' }],
    observedWorld: { ...base.observedWorld, buildings: base.observedWorld.buildings.slice(0, 1) },
  };
  const render = (viewMode) => act(async () => root.render(React.createElement(ColonyScene, { state, onSelect() {}, rendererFactory: factory, viewMode, readOnly: viewMode === 'local' })));
  await render('earth');
  const world = renderers[0].scene.children.find((object) => object.isGroup);
  assert.equal(world.children.filter((object) => object.userData.kind === 'building').length, 1, 'Earth mode keeps the local habitat hidden');
  await render('local');
  assert.equal(world.children.filter((object) => object.userData.kind === 'building').length, state.buildings.length, 'explicit local mode can inspect the live colony');
  await render('earth');
  assert.equal(world.children.filter((object) => object.userData.kind === 'building').length, 1, 'Earth boundary is restored when the mode closes');
});

test('Earth masks received structures, roads, robots, and their selection targets by survey', async (t) => {
  const { root, renderers, factory } = await setup(t);
  const base = createGame();
  const remote = { id: 'remote-launch', type: 'launch', x: 25, y: 25, status: 'complete' };
  const state = {
    ...base,
    buildings: [...base.buildings, remote],
    robots: [...base.robots, { id: 'remote-rover', type: 'cargo', x: 25, y: 25, status: 'idle' }],
    roads: [...base.roads, { x: 25, y: 25 }],
    observedWorld: {
      buildings: [...base.observedWorld.buildings, remote],
      robots: [...base.observedWorld.robots, { id: 'remote-rover', type: 'cargo', x: 25, y: 25, status: 'idle' }],
      roads: [...base.observedWorld.roads, { x: 25, y: 25 }],
    },
  };
  await act(async () => root.render(React.createElement(ColonyScene, { state, onSelect() {}, rendererFactory: factory })));
  const world = renderers[0].scene.children.find((object) => object.isGroup);
  assert.equal(world.children.filter((object) => object.userData.kind === 'building').some((object) => object.userData.id === remote.id), false);
  assert.equal(world.children.filter((object) => object.userData.kind === 'robot').some((object) => object.userData.id === 'remote-rover'), false);
  const remoteTileObjects = world.children.filter((object) => object.userData.kind === 'tile' && object.userData.x === 25 && object.userData.y === 25);
  assert.equal(remoteTileObjects.length, 2, 'fog tile and its pick target remain without rendering the remote road');
  assert.ok(world.children.filter((object) => object.userData.kind === 'building').length < base.observedWorld.buildings.length, 'at least one received structure is masked');
});

test('failed initialization keeps a mounted host and can retry successfully', async (t) => {
  const { root, renderers, factory } = await setup(t); let attempts = 0;
  const retryFactory = () => { if (++attempts === 1) throw new Error('Test GPU unavailable'); return factory(); };
  await act(async () => root.render(React.createElement(ColonyScene, { state: createGame(), onSelect() {}, rendererFactory: retryFactory })));
  const host = document.querySelector('.scene-shell');
  assert.match(document.querySelector('[role="alert"]').textContent, /Test GPU unavailable/);
  await act(async () => document.querySelector('.scene-fallback button').click());
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(document.querySelector('.scene-shell'), host);
  assert.equal(renderers.length, 1);
});

test('context loss is reported and browser restoration clears the error', async (t) => {
  const { dom, root, renderers, factory } = await setup(t);
  await act(async () => root.render(React.createElement(ColonyScene, { state: createGame(), onSelect() {}, rendererFactory: factory })));
  const canvas = renderers[0].domElement;
  const lost = new dom.window.Event('webglcontextlost', { cancelable: true });
  await act(async () => canvas.dispatchEvent(lost));
  assert.equal(lost.defaultPrevented, true);
  assert.match(document.querySelector('[role="alert"]').textContent, /lost the WebGL 2 context/);
  await act(async () => canvas.dispatchEvent(new dom.window.Event('webglcontextrestored')));
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(renderers.length, 1);
});
