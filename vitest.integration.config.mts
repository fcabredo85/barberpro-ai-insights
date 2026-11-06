import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/** Integration tests against a LOCAL Supabase instance (`npx supabase start`). */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Avoid tripping local Auth sign-up rate limits.
    fileParallelism: false,
  },
});
