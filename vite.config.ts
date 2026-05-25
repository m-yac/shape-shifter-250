import { defineConfig } from "vite";

// Minimal Vite config. The app is a single fullscreen canvas (see index.html).
// The isomorphism check runs in a Web Worker, which Vite bundles automatically
// via the `new Worker(new URL(...), { type: "module" })` pattern.
export default defineConfig({
  server: { open: true },
});
