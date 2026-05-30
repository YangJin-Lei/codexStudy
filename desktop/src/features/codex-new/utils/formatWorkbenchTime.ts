export function formatWorkbenchTime(timestamp: number, locale: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
