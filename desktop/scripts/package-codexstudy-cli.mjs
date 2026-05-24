import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, "..");
const repoRoot = join(desktopDir, "..");
const codexWorkspaceDir = join(repoRoot, "codex-rs");
const distDir = join(desktopDir, "dist", "codexstudy-cli-win");

const targetTriple =
  process.env.CARGO_BUILD_TARGET?.trim() || "x86_64-pc-windows-msvc";
const builtBinaryPath = join(
  codexWorkspaceDir,
  "target",
  targetTriple,
  "release",
  "codexstudy.exe",
);

if (!existsSync(builtBinaryPath)) {
  throw new Error(
    `CLI binary not found at ${builtBinaryPath}. Run: pnpm --dir desktop prepare:bundled-codex:force --release`,
  );
}

mkdirSync(distDir, { recursive: true });
const outputPath = join(distDir, "codexstudy.exe");
copyFileSync(builtBinaryPath, outputPath);

const sizeMb = (statSync(outputPath).size / (1024 * 1024)).toFixed(1);
console.log(`[package:cli] wrote ${outputPath} (${sizeMb} MiB)`);
console.log("[package:cli] This is the terminal TUI binary (not the desktop GUI).");
