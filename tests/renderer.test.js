import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { createColonyRenderer, disposeObjectTree } from '../src/scene/renderer.js';

test('renderer retries without antialiasing and leaves GPU selection to the browser', () => {
  const calls = [];
  class Renderer {
    constructor(options) {
      calls.push(options);
      if (options.antialias) throw new Error('Antialiasing unavailable');
    }
  }
  assert.ok(createColonyRenderer(Renderer) instanceof Renderer);
  assert.deepEqual(calls, [
    { antialias: true, powerPreference: 'default' },
    { antialias: false, powerPreference: 'default' },
  ]);
});

test('renderer failure preserves the actual errors from both attempts', () => {
  class Renderer { constructor() { throw new Error('WebGL 2 blocked by host'); } }
  assert.throws(() => createColonyRenderer(Renderer), /Standard detail: WebGL 2 blocked by host\nReduced detail: WebGL 2 blocked by host/);
});

test('scene disposal releases shared GPU resources once and removes objects', () => {
  const world = new Group(); const geometry = new BoxGeometry(); const material = new MeshBasicMaterial();
  let geometries = 0; let materials = 0;
  geometry.addEventListener('dispose', () => geometries++);
  material.addEventListener('dispose', () => materials++);
  world.add(new Mesh(geometry, material), new Mesh(geometry, material));
  disposeObjectTree(world);
  assert.equal(geometries, 1); assert.equal(materials, 1);
  assert.equal(world.children.length, 0);
});
