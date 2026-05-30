import type { CodexNewDiffHunk } from "../../types";
import { DiffHunkBody } from "./DiffHunkBody";

type DiffHunkProps = {
  hunk: CodexNewDiffHunk;
  hunkIndex: number;
  filePath: string;
  isSelected: boolean;
  onToggle?: (path: string, hunkIndex: number) => void;
};

export function DiffHunk({ hunk, hunkIndex, filePath, isSelected, onToggle }: DiffHunkProps) {
  const hunkKey = `${filePath}:${hunkIndex}`;

  return (
    <div className={`diff-hunk${isSelected ? " selected" : ""}`}>
      <div className="diff-hunk-header">
        {onToggle && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(filePath, hunkIndex)}
            className="diff-hunk-checkbox"
          />
        )}
        <code className="diff-hunk-range">{hunk.header}</code>
      </div>
      <DiffHunkBody lines={hunk.preview} hunkKey={hunkKey} />
    </div>
  );
}
