import { useCallback, useEffect, useState } from "react";
import {
  DIFF_HUNKS_INITIAL_BATCH,
  DIFF_HUNKS_LOAD_BATCH,
  sliceWithLoadMore,
} from "../constants/diffPagination";

export function useDiffHunkPagination(filePath: string | null, hunkCount: number) {
  const [visibleHunkCount, setVisibleHunkCount] = useState(DIFF_HUNKS_INITIAL_BATCH);

  useEffect(() => {
    setVisibleHunkCount(DIFF_HUNKS_INITIAL_BATCH);
  }, [filePath, hunkCount]);

  const loadMoreHunks = useCallback(() => {
    setVisibleHunkCount((current) => Math.min(hunkCount, current + DIFF_HUNKS_LOAD_BATCH));
  }, [hunkCount]);

  const hunkSlice = sliceWithLoadMore(
    Array.from({ length: hunkCount }, (_, index) => index),
    visibleHunkCount,
  );

  return {
    visibleHunkIndexes: hunkSlice.visible,
    hiddenHunkCount: hunkSlice.hiddenCount,
    hasMoreHunks: hunkSlice.hasMore,
    loadMoreHunks,
    showAllHunks: visibleHunkCount >= hunkCount,
  };
}
