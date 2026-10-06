import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works whether it's served from the domain root
  // or a GitHub Pages project-page subpath (https://user.github.io/repo-name/).
  base: "./",
  server: {
    port: 5173,
    host: true,
    // Lets the app use same-origin "/api/..." paths in dev exactly as it does on Vercel,
    // so no environment-specific API URL is needed in either place.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
