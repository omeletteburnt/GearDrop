import { defineConfig } from "vitest/config";
// @ts-ignore JavaScript guard is shared with the test runner and browser config.
import { assertStagingTarget } from "./tools/test-target.mjs";
assertStagingTarget(process.env);
export default defineConfig({test:{environment:"node",include:["tests/integration/**/*.test.ts"]}});
