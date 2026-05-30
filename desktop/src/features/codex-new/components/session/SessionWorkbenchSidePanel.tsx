import X from "lucide-react/dist/esm/icons/x";
import type { ReactNode } from "react";

type SessionWorkbenchSidePanelProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function SessionWorkbenchSidePanel({
  title,
  onClose,
  children,
}: SessionWorkbenchSidePanelProps) {
  return (
    <section className="session-workbench-side-panel" aria-label={title}>
      <header className="session-workbench-side-panel-header">
        <h3 className="session-workbench-side-panel-title">{title}</h3>
        <button
          type="button"
          className="session-workbench-side-panel-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>
      <div className="session-workbench-side-panel-body">{children}</div>
    </section>
  );
}
