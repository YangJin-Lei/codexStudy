import { useMemo } from "react";
import { buildGitNodes } from "./layoutNodes/buildGitNodes";
import type { GitLayoutNodesOptions } from "./layoutNodes/buildGitNodes";
import { buildPrimaryNodes } from "./layoutNodes/buildPrimaryNodes";
import type { PrimaryLayoutNodesOptions } from "./layoutNodes/buildPrimaryNodes";
import { buildSecondaryNodes } from "./layoutNodes/buildSecondaryNodes";
import type { SecondaryLayoutNodesOptions } from "./layoutNodes/buildSecondaryNodes";
import type { LayoutNodesOptions, LayoutNodesResult } from "./layoutNodes/types";
import { TerminalDock } from "../../terminal/components/TerminalDock";
import { TerminalPanel } from "../../terminal/components/TerminalPanel";

function useStableTerminalDockNode(options: SecondaryLayoutNodesOptions) {
  const { terminalDockProps, terminalState } = options;
  const terminalTabsKey = terminalDockProps.terminals.map((tab) => tab.id).join("\n");

  const terminalPanelNode = useMemo(() => {
    if (!terminalState) {
      return null;
    }
    return (
      <TerminalPanel
        containerRef={terminalState.containerRef}
        status={terminalState.status}
        message={terminalState.message}
      />
    );
  }, [terminalState?.containerRef, terminalState?.message, terminalState?.status]);

  return useMemo(
    () => (
      <TerminalDock
        {...terminalDockProps}
        terminalNode={terminalPanelNode}
      />
    ),
    [
      terminalDockProps.activeTerminalId,
      terminalDockProps.isOpen,
      terminalDockProps.onCloseTerminal,
      terminalDockProps.onNewTerminal,
      terminalDockProps.onResizeStart,
      terminalDockProps.onSelectTerminal,
      terminalPanelNode,
      terminalTabsKey,
    ],
  );
}

export function useLayoutNodes(options: LayoutNodesOptions): LayoutNodesResult {
  const primaryOptions: PrimaryLayoutNodesOptions = options.primary;
  const gitOptions: GitLayoutNodesOptions = options.git;
  const secondaryOptions: SecondaryLayoutNodesOptions = options.secondary;
  const secondaryNodes = buildSecondaryNodes(secondaryOptions);
  const terminalDockNode = useStableTerminalDockNode(secondaryOptions);

  return {
    ...buildPrimaryNodes(primaryOptions),
    ...buildGitNodes(gitOptions),
    ...secondaryNodes,
    terminalDockNode,
  };
}
