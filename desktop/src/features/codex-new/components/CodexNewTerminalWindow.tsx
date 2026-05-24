import { CodexNewProcessWindow } from "./CodexNewProcessWindow";

/** Legacy terminal window label now routes into the process window terminal dock. */
export function CodexNewTerminalWindow() {
  return <CodexNewProcessWindow initialTerminalDockOpen />;
}
