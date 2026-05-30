import { isComputerUseWorkspace } from "@/features/computer-use/computerUseStorage";
import {
  getChatAgentSettingsBackend,
  selectChatAgentEngineBackend,
} from "@/services/tauri";
import type { WorkspaceInfo } from "@/types";

export type ResolvedAgentEngine = "chat_agent" | "codex_core";

export type SendRoutingContext = {
  workspace: WorkspaceInfo;
  model: string | null;
  shouldSteer: boolean;
  imageCount: number;
  fileCount: number;
  needsMcp?: boolean;
};

export function canRouteSendToChatAgent(context: SendRoutingContext): boolean {
  if (isComputerUseWorkspace(context.workspace)) {
    return false;
  }
  if (context.shouldSteer) {
    return false;
  }
  if (context.imageCount > 0 || context.fileCount > 0) {
    return false;
  }
  if (!context.model?.trim()) {
    return false;
  }
  return true;
}

export async function resolveAgentEngineForSend(
  context: SendRoutingContext,
): Promise<ResolvedAgentEngine> {
  const settings = await getChatAgentSettingsBackend();
  const preference = settings.enginePreference;
  if (preference === "codex_core") {
    return "codex_core";
  }
  if (preference === "chat_agent") {
    return "chat_agent";
  }

  const selection = await selectChatAgentEngineBackend({
    workspaceId: context.workspace.id,
    model: context.model ?? "",
    needsMcp: context.needsMcp ?? false,
    wantsStepCards: true,
  });
  return selection.engine === "chat_agent" ? "chat_agent" : "codex_core";
}
