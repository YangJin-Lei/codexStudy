import { useCallback, useEffect, useRef, useState } from "react";

import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";

import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";

import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";

import { useI18n } from "@/i18n/I18nProvider";

import type { CodexNewTerminalRun } from "../types";

import {

  readCodexNewTerminalDockHeight,

  writeCodexNewTerminalDockHeight,

} from "../services/uiPreferences";

import { CodexNewTerminalPanel } from "./CodexNewTerminalPanel";



type CodexNewTerminalDockProps = {

  open: boolean;

  onToggle: () => void;

  runs: CodexNewTerminalRun[];

};



export function CodexNewTerminalDock({ open, onToggle, runs }: CodexNewTerminalDockProps) {

  const { t } = useI18n();

  const runningCount = runs.filter((run) => run.status === "running").length;

  const [dockHeight, setDockHeight] = useState(readCodexNewTerminalDockHeight);

  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);



  useEffect(() => {

    writeCodexNewTerminalDockHeight(dockHeight);

  }, [dockHeight]);



  const handleResizePointerDown = useCallback(

    (event: React.PointerEvent<HTMLDivElement>) => {

      if (!open) {

        return;

      }

      event.preventDefault();

      resizeRef.current = { startY: event.clientY, startHeight: dockHeight };

      event.currentTarget.setPointerCapture(event.pointerId);

    },

    [dockHeight, open],

  );



  const handleResizePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {

    const snapshot = resizeRef.current;

    if (!snapshot) {

      return;

    }

    const delta = snapshot.startY - event.clientY;

    setDockHeight(snapshot.startHeight + delta);

  }, []);



  const handleResizePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {

    resizeRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {

      event.currentTarget.releasePointerCapture(event.pointerId);

    }

  }, []);



  return (

    <aside

      className={`codex-new-terminal-dock${open ? " is-open" : ""}`}

      style={open ? { height: dockHeight + 40 } : undefined}

    >

      <button type="button" className="codex-new-terminal-dock-toggle" onClick={onToggle}>

        <span className="codex-new-terminal-dock-toggle-left">

          <TerminalSquare size={14} aria-hidden />

          <span>{t("codexNew.window.terminalDock", "Terminal")}</span>

          {runs.length > 0 ? (

            <span className="codex-new-terminal-dock-count">{runs.length}</span>

          ) : null}

          {runningCount > 0 ? (

            <span className="codex-new-terminal-dock-running">{runningCount}</span>

          ) : null}

        </span>

        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}

      </button>

      {open ? (

        <>

          <div

            className="codex-new-terminal-dock-resize"

            role="separator"

            aria-orientation="horizontal"

            aria-label={t("codexNew.window.terminalResize", "Resize terminal panel")}

            onPointerDown={handleResizePointerDown}

            onPointerMove={handleResizePointerMove}

            onPointerUp={handleResizePointerUp}

            onPointerCancel={handleResizePointerUp}

          />

          <div className="codex-new-terminal-dock-body" style={{ height: dockHeight }}>

            <CodexNewTerminalPanel runs={runs} compact />

          </div>

        </>

      ) : null}

    </aside>

  );

}


