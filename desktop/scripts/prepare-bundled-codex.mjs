import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, "..");
const repoRoot = join(desktopDir, "..");
const codexWorkspaceDir = join(repoRoot, "codex-rs");
const binariesDir = join(desktopDir, "src-tauri", "binaries");

function parseFlagValue(flagName) {
  const flagWithEquals = `${flagName}=`;
  const withEquals = process.argv.find((arg) => arg.startsWith(flagWithEquals));
  if (withEquals) {
    return withEquals.slice(flagWithEquals.length);
  }

  const flagIndex = process.argv.indexOf(flagName);
  if (flagIndex >= 0 && flagIndex + 1 < process.argv.length) {
    return process.argv[flagIndex + 1];
  }

  return null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `${command} exited with code ${result.status}`);
  }

  return result.stdout ?? "";
}

function runCargoBuild(args) {
  const buildEnv = resolveCargoBuildEnv();
  const attempts = [
    { label: "default", extraArgs: [] },
    { label: "stable", extraArgs: ["+stable"] },
  ];

  for (const attempt of attempts) {
    const cargoArgs = [...attempt.extraArgs, ...args];
    const build = spawnSync("cargo", cargoArgs, {
      cwd: codexWorkspaceDir,
      stdio: "inherit",
      env: buildEnv,
    });

    if (!build.error && build.status === 0) {
      return;
    }

    if (attempt.label === "default") {
      console.warn(
        "[prepare:bundled-codex] default cargo build failed, retrying with `cargo +stable`",
      );
      continue;
    }

    if (build.error) {
      throw build.error;
    }

    throw new Error(`cargo build exited with code ${build.status ?? "unknown"}`);
  }
}

function resolveCargoBuildEnv() {
  const env = { ...process.env };
  if (env.RUSTY_V8_ARCHIVE) {
    return env;
  }

  const localArchive = findLocalRustyV8Archive();
  if (localArchive) {
    env.RUSTY_V8_ARCHIVE = localArchive;
    console.log(`[prepare:bundled-codex] using local rusty_v8 archive at ${localArchive}`);
  }

  return env;
}

function findLocalRustyV8Archive() {
  if (process.platform !== "win32") {
    return null;
  }

  const archiveName = "rusty_v8_release_x86_64-pc-windows-msvc.lib.gz";
  const candidates = [
    join(homedir(), "Downloads", archiveName),
    join(homedir(), ".cargo", ".rusty_v8", archiveName),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveHostTriple() {
  const rustcVersion = run("rustc", ["-vV"]);
  const hostLine = rustcVersion
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().startsWith("host:"));

  if (!hostLine) {
    throw new Error("Unable to determine Rust host triple from `rustc -vV`.");
  }

  return hostLine.slice("host:".length).trim();
}

function resolveTargetTriple() {
  const explicitTarget =
    parseFlagValue("--target") ??
    process.env.CARGO_BUILD_TARGET ??
    process.env.TAURI_ENV_TARGET_TRIPLE;

  if (explicitTarget) {
    return explicitTarget;
  }

  return resolveHostTriple();
}

function latestMtime(rootPath, { skipDirNames = new Set(["target"]) } = {}) {
  if (!existsSync(rootPath)) {
    return 0;
  }

  const stat = statSync(rootPath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  let max = stat.mtimeMs;
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    if (skipDirNames.has(entry.name)) {
      continue;
    }

    const childPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      max = Math.max(max, latestMtime(childPath, { skipDirNames }));
    } else if (entry.isFile()) {
      max = Math.max(max, statSync(childPath).mtimeMs);
    }
  }

  return max;
}

function resolveBuiltBinaryPath(targetTriple, hostTriple, profile, executableName) {
  const useCrossTarget = targetTriple !== hostTriple;
  if (useCrossTarget) {
    return join(codexWorkspaceDir, "target", targetTriple, profile, executableName);
  }

  return join(codexWorkspaceDir, "target", profile, executableName);
}

function isBuiltBinaryFresh(builtBinaryPath, sourceRoots) {
  if (!existsSync(builtBinaryPath)) {
    return false;
  }

  const builtMtime = statSync(builtBinaryPath).mtimeMs;
  for (const sourceRoot of sourceRoots) {
    if (latestMtime(sourceRoot) > builtMtime) {
      return false;
    }
  }

  return true;
}

function stageBuiltBinary(builtBinaryPath, stagedBinaryPath) {
  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(builtBinaryPath, stagedBinaryPath);

  if (process.platform !== "win32") {
    chmodSync(stagedBinaryPath, 0o755);
  }

  console.log(`[prepare:bundled-codex] staged ${stagedBinaryPath}`);
}

const force = process.argv.includes("--force");
const release = process.argv.includes("--release");
const profile = release ? "release" : "debug";
const hostTriple = resolveHostTriple();
const targetTriple = resolveTargetTriple();
const useCrossTarget = targetTriple !== hostTriple;
const executableName =
  process.platform === "win32" ? "codexstudy.exe" : "codexstudy";
// Sidecar name must differ from the Tauri main binary (`codexstudy.exe`) so NSIS does not overwrite it.
const stagedName = `codexstudy-cli-${targetTriple}${process.platform === "win32" ? ".exe" : ""}`;
const legacyStagedName = `codexstudy-${targetTriple}${process.platform === "win32" ? ".exe" : ""}`;
const stagedBinaryPath = join(binariesDir, stagedName);
const legacyStagedBinaryPath = join(binariesDir, legacyStagedName);
const builtBinaryPath = resolveBuiltBinaryPath(
  targetTriple,
  hostTriple,
  profile,
  executableName,
);

const sourceRoots = [
  join(codexWorkspaceDir, "Cargo.lock"),
  join(codexWorkspaceDir, "Cargo.toml"),
  join(codexWorkspaceDir, "cli"),
  join(codexWorkspaceDir, "core"),
  join(codexWorkspaceDir, "tui"),
  join(codexWorkspaceDir, "exec"),
  join(codexWorkspaceDir, "utils"),
];

if (!existsSync(stagedBinaryPath) && existsSync(legacyStagedBinaryPath)) {
  copyFileSync(legacyStagedBinaryPath, stagedBinaryPath);
  console.log(`[prepare:bundled-codex] migrated legacy sidecar to ${stagedName}`);
}

if (
  !force &&
  isBuiltBinaryFresh(builtBinaryPath, sourceRoots) &&
  existsSync(stagedBinaryPath) &&
  statSync(stagedBinaryPath).mtimeMs >= statSync(builtBinaryPath).mtimeMs
) {
  console.log(
    `[prepare:bundled-codex] skip rebuild; staged ${stagedName} is up to date (${profile})`,
  );
  process.exit(0);
}

if (!force && isBuiltBinaryFresh(builtBinaryPath, sourceRoots)) {
  console.log(
    `[prepare:bundled-codex] skip cargo build; reusing ${builtBinaryPath} (${profile})`,
  );
  stageBuiltBinary(builtBinaryPath, stagedBinaryPath);
  process.exit(0);
}

// Default bundle target is codexstudy only (faster). For the legacy `codex` binary:
//   cargo build -p codex-cli --bin codex --target <triple> [--release]
const cargoArgs = ["build", "-p", "codex-cli", "--bin", "codexstudy"];
if (useCrossTarget) {
  cargoArgs.push("--target", targetTriple);
}

if (release) {
  cargoArgs.push("--release");
}

console.log(`[prepare:bundled-codex] building ${executableName} for ${targetTriple} (${profile})`);
runCargoBuild(cargoArgs);

if (!existsSync(builtBinaryPath)) {
  throw new Error(`Built CodexStudy binary not found at ${builtBinaryPath}`);
}

stageBuiltBinary(builtBinaryPath, stagedBinaryPath);
