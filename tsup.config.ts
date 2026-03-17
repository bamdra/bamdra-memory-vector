import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const configDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: false,
  bundle: true,
  shims: true,
  target: "node22",
  splitting: false,
  noExternal: [/.*/],
  external: [
    "node:crypto",
    "node:fs",
    "node:os",
    "node:path"
  ],
  outExtension() {
    return { js: ".js" };
  },
  esbuildOptions(options) {
    options.platform = "node";
    options.target = "node22";
    options.alias = {
      ...(options.alias ?? {}),
      "@openclaw-enhanced/memory-core": resolve(configDir, "../bamdra-openclaw-memory/packages/memory-core/src/index.ts"),
    };
  }
});
