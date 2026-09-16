import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Build for the published design preview: the same app, entered through
 * src/preview (demo data, no auth gate, hash routing), emitted with relative
 * asset paths so it runs from any static host. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist-preview",
    emptyOutDir: true,
    rollupOptions: { input: "preview.html" },
  },
});
