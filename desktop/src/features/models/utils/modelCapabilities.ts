type ImageCapableModelLike = {
  inputModalities?: string[];
};

export function modelSupportsImageInput(
  model: ImageCapableModelLike | null | undefined,
): boolean {
  return Boolean(model?.inputModalities?.includes("image"));
}

export function attachmentsEnabledForModel(
  model: ImageCapableModelLike | null | undefined,
  visionFallbackReady = false,
): boolean {
  return modelSupportsImageInput(model) || visionFallbackReady;
}
