import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/integration/**", "node_modules/**"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**"],
      exclude: ["components/ui/**"],
    },
  },
});
