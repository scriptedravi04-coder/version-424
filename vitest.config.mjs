import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
  plugins: [react()],
  // Session 39: same "@" alias as vite.config.js so pages that import "@/lib/..." can be tested.
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    environment: "jsdom",
    globals: false,
    env: {
      K_SERVICE: "",
      APP_URL: "",
      SITE_URL: "",
    },
  },
});
