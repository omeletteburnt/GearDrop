import { defineConfig } from "@playwright/test";
// @ts-ignore Shared JavaScript guard.
import { assertStagingTarget } from "./tools/test-target.mjs";
assertStagingTarget(process.env);
export default defineConfig({
  testDir:"./tests/e2e",workers:1,retries:0,
  webServer:{command:"node node_modules/vite/bin/vite.js --host localhost --port 4174 --strictPort",url:"http://localhost:4174",reuseExistingServer:false,timeout:30000},
  use:{baseURL:"http://localhost:4174"},
});
