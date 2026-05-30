import type { CodexNewFilePreview } from "../../types";

type ThreeWayPreviewColumnProps = {
  title: string;
  preview: CodexNewFilePreview | null;
  isLoading: boolean;
};

function renderPreviewBody(preview: CodexNewFilePreview | null, emptyLabel: string) {
  if (!preview) {
    return <div className="three-way-column-empty">{emptyLabel}</div>;
  }
  if (preview.status === "binary") {
    return <div className="three-way-column-empty">Binary file</div>;
  }
  if (preview.status === "missing") {
    return <div className="three-way-column-empty">File missing</div>;
  }
  if (!preview.content) {
    return <div className="three-way-column-empty">(empty)</div>;
  }
  return (
    <>
      {preview.truncated ? <div className="three-way-column-truncated">… truncated</div> : null}
      <pre className="three-way-column-pre">{preview.content}</pre>
    </>
  );
}

export function ThreeWayPreviewColumn({ title, preview, isLoading }: ThreeWayPreviewColumnProps) {
  return (
    <section className="three-way-column" aria-label={title}>
      <header className="three-way-column-header">{title}</header>
      <div className="three-way-column-body">
        {isLoading ? (
          <div className="three-way-column-empty">Loading…</div>
        ) : (
          renderPreviewBody(preview, "No preview")
        )}
      </div>
    </section>
  );
}
