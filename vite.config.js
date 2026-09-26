import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so `npm run build` output can be served from any sub-path
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
    open: false,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // keep the WebGL layer in its own chunk so the DOM shell paints first
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
