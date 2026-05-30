import { useCallback, useEffect, useState } from "react";
import {
  DIFF_HUNK_LINES_INITIAL,
  DIFF_HUNK_LINES_LOAD_BATCH,
  sliceWithLoadMore,
} from "../constants/diffPagination";

type UsePaginatedLinesOptions = {
  initialCount?: number;
  loadBatch?: number;
};

export function usePaginatedLines(
  lineCount: number,
  resetKey: string,
  options?: UsePaginatedLinesOptions,
) {
  const initialCount = options?.initialCount ?? DIFF_HUNK_LINES_INITIAL;
  const loadBatch = options?.loadBatch ?? DIFF_HUNK_LINES_LOAD_BATCH;
  const [visibleLineCount, setVisibleLineCount] = useState(initialCount);

  useEffect(() => {
    setVisibleLineCount(initialCount);
  }, [initialCount, resetKey, lineCount]);

  const loadMoreLines = useCallback(() => {
    setVisibleLineCount((current) => Math.min(lineCount, current + loadBatch));
  }, [lineCount, loadBatch]);

  const lineSlice = sliceWithLoadMore(
    Array.from({ length: lineCount }, (_, index) => index),
    visibleLineCount,
  );

  return {
    visibleLineCount,
    hiddenLineCount: lineSlice.hiddenCount,
    hasMoreLines: lineSlice.hasMore,
    loadMoreLines,
  };
}
