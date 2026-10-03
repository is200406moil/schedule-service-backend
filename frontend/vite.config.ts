import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/static/react/",
  input: {
    overview: resolve(import.meta.dirname, "src/entries/overview-main.tsx"),
    calendar: resolve(import.meta.dirname, "src/entries/calendar-main.tsx"),
    tasks: resolve(import.meta.dirname, "src/entries/tasks-main.tsx"),
    taskEditor: resolve(import.meta.dirname, "src/entries/task-editor-main.tsx"),
    profile: resolve(import.meta.dirname, "src/entries/profile-main.tsx"),
    auth: resolve(import.meta.dirname, "src/entries/auth-main.tsx"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
  },
});
