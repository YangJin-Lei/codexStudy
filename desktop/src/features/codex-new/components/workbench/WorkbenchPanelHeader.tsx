import type { ReactNode } from "react";

type WorkbenchPanelHeaderProps = {
  icon?: ReactNode;
  title: string;
  meta?: string;
  children?: ReactNode;
};

export function WorkbenchPanelHeader({ icon, title, meta, children }: WorkbenchPanelHeaderProps) {
  return (
    <header className="wb-panel-header">
      <div className="wb-panel-header-row">
        <h2 className="wb-panel-header-title">
          {icon}
          {title}
        </h2>
      </div>
      {meta ? <div className="wb-panel-header-meta">{meta}</div> : null}
      {children}
    </header>
  );
}
