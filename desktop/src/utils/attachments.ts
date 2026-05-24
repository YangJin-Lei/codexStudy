const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".svg",
] as const;

export function isInlineImageAttachment(path: string): boolean {
  const trimmed = path.trim().toLowerCase();
  return trimmed.startsWith("data:image/");
}

export function isRemoteImageAttachment(path: string): boolean {
  const trimmed = path.trim().toLowerCase();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

export function isImageAttachmentPath(path: string): boolean {
  const trimmed = path.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  if (isInlineImageAttachment(trimmed) || isRemoteImageAttachment(trimmed)) {
    return true;
  }
  return IMAGE_EXTENSIONS.some((extension) => trimmed.endsWith(extension));
}

export function splitAttachmentPaths(paths: string[]): {
  images: string[];
  files: string[];
} {
  const images: string[] = [];
  const files: string[] = [];
  for (const rawPath of paths) {
    const path = rawPath.trim();
    if (!path) {
      continue;
    }
    if (isImageAttachmentPath(path)) {
      images.push(path);
    } else {
      files.push(path);
    }
  }
  return { images, files };
}

export function attachmentFileName(path: string): string {
  if (isInlineImageAttachment(path)) {
    return "Pasted image";
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}
