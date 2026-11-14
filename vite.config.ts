import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensions = ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'];

/**
 * React Native libraries ship browser variants as `name.web.js` next to `name.js` and import them
 * without an extension. Vite applies `resolve.extensions` to our own code only, so do the same
 * lookup for relative imports inside node_modules (react-native-svg needs it).
 */
const SOUND_STUB = '\0svg-sound-stub';

function preferWebFiles(): Plugin {
  return {
    name: 'prefer-web-files',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.') || !importer.includes('node_modules')) return null;
      // Native-only touch sound module that the browser code path still imports.
      if (source.endsWith('fabric/NativeSvgSoundModule')) return SOUND_STUB;
      const base = resolve(dirname(importer.split('?')[0]), source);
      for (const ext of ['.web.js', '.web.jsx']) if (existsSync(base + ext)) return base + ext;
      return null;
    },
    load(id) {
      return id === SOUND_STUB ? 'export default { playTouchSound() {} };' : null;
    },
  };
}

// The browser build runs the same React Native code through react-native-web.
export default defineConfig({
  // Relative asset paths, so the build works under any GitHub Pages sub-path.
  base: './',
  plugins: [preferWebFiles(), react()],
  resolve: {
    alias: [
      { find: '@react-native/assets-registry/registry', replacement: resolve(__dirname, 'src/shims/assetsRegistry.web.ts') },
      { find: /^react-native$/, replacement: 'react-native-web' },
    ],
    extensions,
  },
  define: { __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'), global: 'globalThis' },
  // Keep react-native-svg out of dependency pre-bundling so the plugin above sees its imports.
  optimizeDeps: { exclude: ['react-native-svg'] },
  server: { port: 5173 },
});
