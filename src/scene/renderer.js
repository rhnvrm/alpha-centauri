import { WebGLRenderer } from 'three';

/** Both attempts remain real WebGL 2; do not silently replace the 3D scene. */
export function createColonyRenderer(Renderer = WebGLRenderer) {
  const attempts = [];
  for (const antialias of [true, false]) {
    try {
      return new Renderer({ antialias, powerPreference: 'default' });
    } catch (error) {
      attempts.push(`${antialias ? 'Standard' : 'Reduced'} detail: ${error.message || String(error)}`);
    }
  }
  throw new Error(attempts.join('\n'));
}

/** Removing an object from a scene does not dispose its GPU allocations. */
export function disposeObjectTree(root) {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  root.clear();
}
