export const MODEL_PROVIDER_SESSION_REFRESHED_EVENT =
  "codexstudy:modelProviderSessionRefreshed";

export type ModelProviderSessionRefreshedDetail = {
  affectedWorkspaceCount: number;
};

export function dispatchModelProviderSessionRefreshed(
  detail: ModelProviderSessionRefreshedDetail,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<ModelProviderSessionRefreshedDetail>(
      MODEL_PROVIDER_SESSION_REFRESHED_EVENT,
      { detail },
    ),
  );
}
