import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["offline/**/*.spec.ts", "e2e/{critical-flows,smoke,modal,navmenu,a11y,safety,nyxmascot}.spec.ts"],
  workers: 2,
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host localhost --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 30_000,
    env: { VITE_SUPABASE_URL:"https://offline.supabase.invalid", VITE_SUPABASE_ANON_KEY:"offline-publishable-key" },
  },
  use: {
    baseURL: "http://localhost:4173",
  },
});
