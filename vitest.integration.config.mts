import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/** Integration tests against a LOCAL Supabase instance (`npx supabase start`). */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Avoid tripping local Auth sign-up rate limits.
    fileParallelism: false,
  },
});
