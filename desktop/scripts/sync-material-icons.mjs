import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const require = createRequire(import.meta.url);

function resolveIconsSourceDir() {
  try {
    const entryPath = require.resolve("vscode-material-icons");
    return join(dirname(entryPath), "..", "generated", "icons");
  } catch {
    return join(
      projectRoot,
      "node_modules",
      "vscode-material-icons",
      "generated",
      "icons",
    );
  }
}

const sourceDir = resolveIconsSourceDir();
const targetDir = join(projectRoot, "public", "assets", "material-icons");

if (!existsSync(sourceDir)) {
  console.warn("[sync:material-icons] source icons directory not found:", sourceDir);
  process.exit(0);
}

mkdirSync(dirname(targetDir), { recursive: true });
rmSync(targetDir, { recursive: true, force: true });
cpSync(sourceDir, targetDir, { recursive: true });
console.log("[sync:material-icons] synced icons to", targetDir);
