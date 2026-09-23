import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/static/react/",
  build: {
    outDir: "../app/static/react",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        overview: resolve(import.meta.dirname, "src/main.tsx"),
        calendar: resolve(import.meta.dirname, "src/calendar-main.tsx"),
      },
    },
  },
});
