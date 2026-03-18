import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const version = process.argv[2] ?? `v${pkg.version}`;
const outDir = resolve(repoRoot, "artifacts", `bamdra-memory-vector-${version}`);
const bundleRoot = resolve(outDir, "bamdra-memory-vector");
const skipBuild = process.env.BAMDRA_MEMORY_VECTOR_SKIP_BUILD === "1";

if (!skipBuild) {
  run(["pnpm", "bundle"]);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(bundleRoot, { recursive: true });

cpSync(resolve(repoRoot, "dist"), resolve(bundleRoot, "dist"), { recursive: true });
cpSync(resolve(repoRoot, "skills"), resolve(bundleRoot, "skills"), { recursive: true });
cpSync(resolve(repoRoot, "openclaw.plugin.json"), resolve(bundleRoot, "openclaw.plugin.json"));
cpSync(resolve(repoRoot, "package.json"), resolve(bundleRoot, "package.json"));
cpSync(resolve(repoRoot, "README.md"), resolve(bundleRoot, "README.md"));
cpSync(resolve(repoRoot, "README.zh-CN.md"), resolve(bundleRoot, "README.zh-CN.md"));
cpSync(resolve(repoRoot, "LICENSE"), resolve(bundleRoot, "LICENSE"));

writeFileSync(
  resolve(bundleRoot, "INSTALL.md"),
  [
    "# bamdra-memory-vector",
    "",
    "Install from npm:",
    "",
    "```bash",
    "openclaw plugins install @bamdra/bamdra-memory-vector",
    "```",
    "",
    "Manual install:",
    "1. Copy `dist/` into the plugin directory as `bamdra-memory-vector`.",
    "2. Ensure `openclaw.plugin.json` is present at the plugin root.",
    "3. Add the plugin to `plugins.allow` and `plugins.entries` in `~/.openclaw/openclaw.json`.",
    "",
    "Primary value:",
    "- local Markdown knowledge base indexing",
    "- semantic recall before unnecessary web lookup",
    "- private and shared knowledge separation",
    "",
  ].join("\n"),
);

writeFileSync(
  resolve(bundleRoot, "RELEASE.txt"),
  [
    `bamdra-memory-vector ${version}`,
    "",
    "Contents:",
    "- dist/",
    "- skills/",
    "- openclaw.plugin.json",
    "- INSTALL.md",
    "- README.md",
    "- README.zh-CN.md",
    "",
    "Install command:",
    "openclaw plugins install @bamdra/bamdra-memory-vector",
    "",
  ].join("\n"),
);

const archives = [
  resolve(outDir, `bamdra-memory-vector-${version}.tar.gz`),
  resolve(outDir, `bamdra-memory-vector-${version}.zip`),
];

run(["tar", "-czf", archives[0], "-C", outDir, basename(bundleRoot)], repoRoot, false);
run(["zip", "-qr", archives[1], basename(bundleRoot)], outDir, false);

writeFileSync(
  resolve(outDir, "SHA256SUMS.txt"),
  `${archives.map((file) => `${sha256(file)}  ${basename(file)}`).join("\n")}\n`,
);

console.log(outDir);

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function run(args, cwd = repoRoot, useCorepack = true) {
  const command = useCorepack ? "corepack" : args[0];
  const finalArgs = useCorepack ? args : args.slice(1);
  const result = spawnSync(command, finalArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
