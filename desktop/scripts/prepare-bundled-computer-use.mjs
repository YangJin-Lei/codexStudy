import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, "..");
const repoRoot = join(desktopDir, "..");
const computerUseRoot = join(repoRoot, "computer-use");
const pluginSourceRoot = join(computerUseRoot, "plugins", "open-computer-use");
const pluginManifestPath = join(pluginSourceRoot, ".codex-plugin", "plugin.json");
const resourcesRoot = join(desktopDir, "src-tauri", "resources", "computer-use");
const marketplaceRoot = join(resourcesRoot, "marketplace");
const pluginStageRoot = join(marketplaceRoot, "plugins", "open-computer-use");
const runtimeStageRoot = join(resourcesRoot, "runtime");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status ?? "unknown"}`);
  }
}

function goArchForNodeArch(arch) {
  switch (arch) {
    case "arm64":
      return "arm64";
    case "x64":
      return "amd64";
    default:
      return null;
  }
}

function readPluginVersion() {
  const manifest = JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  if (typeof manifest.version !== "string" || manifest.version.trim().length === 0) {
    throw new Error(`Missing plugin version in ${pluginManifestPath}`);
  }
  return manifest.version.trim();
}

function buildWindowsRuntime(version, goArch) {
  const moduleDir = join(computerUseRoot, "apps", "OpenComputerUseWindows");
  const outputDir = join(computerUseRoot, "dist", "windows", goArch);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "open-computer-use.exe");
  run(
    "go",
  [
      "build",
      "-trimpath",
      `-ldflags=-s -w -X main.version=${version}`,
      "-o",
      outputPath,
      ".",
    ],
    {
      cwd: moduleDir,
      env: {
        ...process.env,
        GOOS: "windows",
        GOARCH: goArch,
        CGO_ENABLED: "0",
      },
    },
  );
  return outputPath;
}

function buildLinuxRuntime(version, goArch) {
  const buildScript = join(computerUseRoot, "scripts", "build-open-computer-use-linux.sh");
  if (!existsSync(buildScript)) {
    throw new Error(`Missing Linux build script at ${buildScript}`);
  }
  run(buildScript, ["--configuration", "release", "--arch", goArch]);
  const outputPath = join(computerUseRoot, "dist", "linux", goArch, "open-computer-use");
  if (!existsSync(outputPath)) {
    throw new Error(`Missing Linux runtime at ${outputPath}`);
  }
  return outputPath;
}

function buildMacRuntime(configuration) {
  const buildScript = join(computerUseRoot, "scripts", "build-open-computer-use-app.sh");
  if (!existsSync(buildScript)) {
    throw new Error(`Missing macOS build script at ${buildScript}`);
  }
  run(buildScript, [configuration]);
  const candidates = [
    join(computerUseRoot, "dist", "Open Computer Use.app"),
    join(computerUseRoot, "dist", "Open Computer Use (Dev).app"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("Missing macOS Open Computer Use app bundle after build.");
}

function writeMarketplaceManifest(version) {
  const marketplaceJson = {
    name: "codexstudy-bundled",
    interface: {
      displayName: "CodexStudy Bundled",
    },
    plugins: [
      {
        name: "open-computer-use",
        source: {
          source: "local",
          path: "./plugins/open-computer-use",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Productivity",
      },
    ],
  };
  writeFileSync(
    join(marketplaceRoot, "marketplace.json"),
    `${JSON.stringify(marketplaceJson, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(resourcesRoot, "VERSION"),
    `${version}\n`,
    "utf8",
  );
}

function writePlatformMcpConfig(platform) {
  let mcpServers;
  if (platform === "win32") {
    mcpServers = {
      "computer-use": {
        command: "./open-computer-use.exe",
        args: ["mcp"],
        cwd: ".",
      },
    };
  } else if (platform === "linux") {
    mcpServers = {
      "computer-use": {
        command: "./open-computer-use",
        args: ["mcp"],
        cwd: ".",
      },
    };
  } else {
    mcpServers = {
      "computer-use": {
        command: "./scripts/launch-open-computer-use.sh",
        cwd: ".",
      },
    };
  }
  writeFileSync(
    join(pluginStageRoot, ".mcp.json"),
    `${JSON.stringify({ mcpServers }, null, 2)}\n`,
    "utf8",
  );
}

function stagePluginTree() {
  rmSync(pluginStageRoot, { recursive: true, force: true });
  mkdirSync(pluginStageRoot, { recursive: true });
  cpSync(pluginSourceRoot, pluginStageRoot, {
    recursive: true,
    filter: (sourcePath) => {
      const normalized = sourcePath.replace(/\\/g, "/");
      return !normalized.includes("/.git/");
    },
  });
}

function stageRuntime(platform, goArch, release) {
  const version = readPluginVersion();
  rmSync(runtimeStageRoot, { recursive: true, force: true });
  mkdirSync(runtimeStageRoot, { recursive: true });

  if (platform === "win32") {
    if (!goArch) {
      throw new Error(`Unsupported Windows architecture: ${process.arch}`);
    }
    const builtPath = buildWindowsRuntime(version, goArch);
    const stagedPath = join(pluginStageRoot, "open-computer-use.exe");
    copyFileSync(builtPath, stagedPath);
    copyFileSync(builtPath, join(runtimeStageRoot, "open-computer-use.exe"));
    return;
  }

  if (platform === "linux") {
    if (!goArch) {
      throw new Error(`Unsupported Linux architecture: ${process.arch}`);
    }
    const builtPath = buildLinuxRuntime(version, goArch);
    const stagedPath = join(pluginStageRoot, "open-computer-use");
    copyFileSync(builtPath, stagedPath);
    copyFileSync(builtPath, join(runtimeStageRoot, "open-computer-use"));
    chmodSync(stagedPath, 0o755);
    chmodSync(join(runtimeStageRoot, "open-computer-use"), 0o755);
    return;
  }

  if (platform === "darwin") {
    const builtPath = buildMacRuntime(release ? "release" : "debug");
    const bundleName = builtPath.split(/[/\\]/).pop();
    cpSync(builtPath, join(pluginStageRoot, bundleName), { recursive: true });
    cpSync(builtPath, join(runtimeStageRoot, bundleName), { recursive: true });
    return;
  }

  throw new Error(`Unsupported platform for bundled computer-use: ${platform}`);
}

function main() {
  if (!existsSync(pluginManifestPath)) {
    throw new Error(`Missing plugin manifest at ${pluginManifestPath}`);
  }

  const release = process.argv.includes("--release");
  const platform = process.platform;
  const goArch = goArchForNodeArch(process.arch);
  const version = readPluginVersion();

  rmSync(resourcesRoot, { recursive: true, force: true });
  mkdirSync(marketplaceRoot, { recursive: true });

  console.log(
    `[prepare:bundled-computer-use] staging open-computer-use ${version} for ${platform}-${process.arch}`,
  );
  stagePluginTree();
  stageRuntime(platform, goArch, release);
  writePlatformMcpConfig(platform);
  writeMarketplaceManifest(version);
  console.log(`[prepare:bundled-computer-use] staged resources at ${resourcesRoot}`);
}

main();
