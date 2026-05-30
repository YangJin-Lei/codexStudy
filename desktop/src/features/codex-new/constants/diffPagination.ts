/** Initial hunks rendered when opening a large diff file. */
export const DIFF_HUNKS_INITIAL_BATCH = 6;

/** Additional hunks loaded per "Show more hunks" click. */
export const DIFF_HUNKS_LOAD_BATCH = 6;

/** Lines shown per hunk before "Show more lines" inside a hunk. */
export const DIFF_HUNK_LINES_INITIAL = 80;

/** Additional diff lines loaded per click inside a hunk. */
export const DIFF_HUNK_LINES_LOAD_BATCH = 80;

/** Terminal stdout/stderr lines shown before pagination. */
export const TERMINAL_OUTPUT_LINES_INITIAL = 200;

/** Additional terminal lines loaded per click. */
export const TERMINAL_OUTPUT_LINES_LOAD_BATCH = 200;

export function sliceWithLoadMore<T>(items: T[], visibleCount: number): {
  visible: T[];
  hiddenCount: number;
  hasMore: boolean;
} {
  const visible = items.slice(0, visibleCount);
  const hiddenCount = Math.max(0, items.length - visible.length);
  return {
    visible,
    hiddenCount,
    hasMore: hiddenCount > 0,
  };
}
