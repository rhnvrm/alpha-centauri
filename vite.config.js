import { defineConfig } from 'vite';

export default defineConfig({
  // The desktop/WebMCP demo is served from localhost during play. Keep the
  // project subpath only for GitHub Pages builds so opening :4173 never needs
  // a redirect before the game can register its native tools.
  base: process.env.GITHUB_ACTIONS ? '/alpha-centauri/' : '/',
});
