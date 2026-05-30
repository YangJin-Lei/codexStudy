import { pathBasename } from "./pathTree";

/** Strip Windows extended-path prefix and normalize slashes for display. */
export function normalizeDisplayPath(path: string): string {
  let normalized = path.replace(/\\/g, "/").trim();
  if (normalized.startsWith("//?/")) {
    normalized = normalized.slice(4);
  }
  if (normalized.startsWith("/?/")) {
    normalized = normalized.slice(3);
  }
  return normalized.replace(/\/+/g, "/").replace(/\/$/, "");
}

/** Shorten a filesystem path for UI labels (home → ~, middle ellipsis). */
export function formatWorkbenchPath(path: string, maxLength = 52): string {
  let normalized = normalizeDisplayPath(path);
  const homeRoot = normalized.match(/^([A-Za-z]:)?\/Users\/[^/]+/i);
  if (homeRoot) {
    normalized = normalized.replace(homeRoot[0], "~");
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const head = Math.max(12, Math.floor(maxLength * 0.42));
  const tail = Math.max(12, maxLength - head - 3);
  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
}

export function formatWorkbenchFileLabel(path: string): string {
  const normalized = normalizeDisplayPath(path);
  const base = pathBasename(normalized);
  const parent = normalized.includes("/") ? pathBasename(normalized.slice(0, normalized.lastIndexOf("/"))) : "";
  if (!parent || parent === base) {
    return base;
  }
  return `${parent}/${base}`;
}
