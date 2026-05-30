import Circle from "lucide-react/dist/esm/icons/circle";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import type { CodexNewChangedFile } from "../../types";
import { formatWorkbenchFileLabel } from "../../utils/displayPath";

type SessionChangedFileRowProps = {
  file: CodexNewChangedFile;
  isSelected: boolean;
  onSelect: () => void;
};

export function SessionChangedFileRow({ file, isSelected, onSelect }: SessionChangedFileRowProps) {
  const statusLetter = file.status === "added" ? "+" : file.status === "modified" ? "M" : "D";

  return (
    <button
      type="button"
      className={`session-changed-file-row${isSelected ? " is-selected" : ""}`}
      onClick={onSelect}
      title={file.path}
    >
      <span className="session-changed-file-row-icon" aria-hidden>
        {file.accepted ? (
          <CheckCircle2 size={14} className="file-icon-merged" />
        ) : (
          <Circle size={14} className="file-icon-pending" />
        )}
      </span>
      <span className="session-changed-file-row-path">{formatWorkbenchFileLabel(file.path)}</span>
      <span className={`session-changed-file-row-status status-${file.status}`}>{statusLetter}</span>
    </button>
  );
}
