import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "codexstudy-icon-source.png");
const iconsDir = join(root, "src-tauri", "icons");

execFileSync(
  "npx",
  [
    "--yes",
    "@tauri-apps/cli",
    "icon",
    source,
    "-o",
    iconsDir,
    "--ios-color",
    "#000000",
  ],
  { cwd: root, stdio: "inherit" },
);

copyFileSync(join(iconsDir, "128x128.png"), join(root, "public", "app-icon.png"));
copyFileSync(join(iconsDir, "32x32.png"), join(iconsDir, "tray-icon.png"));
