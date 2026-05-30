export function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function pathBasename(path: string) {
  const normalized = normalizePathSeparators(path);
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function pathParentLabel(path: string) {
  const normalized = normalizePathSeparators(path);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return normalized;
  }
  return segments.slice(0, -1).join("/");
}

export type PathTreeSegment = {
  name: string;
  path: string;
};

export function buildPathTreeSegments(path: string): PathTreeSegment[] {
  const normalized = normalizePathSeparators(path);
  const segments = normalized.split("/").filter(Boolean);
  const isWindowsDrive = /^[A-Za-z]:$/.test(segments[0] ?? "");
  const items: PathTreeSegment[] = [];
  let current = "";
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (index === 0 && isWindowsDrive) {
      current = `${segment}/`;
    } else {
      current = current ? `${current}/${segment}` : segment;
    }
    items.push({ name: segment, path: current });
  }
  return items;
}
