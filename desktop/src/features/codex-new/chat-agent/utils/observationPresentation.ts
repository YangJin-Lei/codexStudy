import type { ChatAgentArtifact, ChatAgentObservation } from "../types";

export type ObservationTruncation = {
  reason?: string;
  spillPath?: string;
  totalLines?: number;
  totalBytes?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readTruncation(value: unknown): ObservationTruncation | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const reason = typeof record.reason === "string" ? record.reason : undefined;
  const spillPath =
    typeof record.spillPath === "string"
      ? record.spillPath
      : typeof record.spill_path === "string"
        ? record.spill_path
        : undefined;
  const totalLines =
    typeof record.totalLines === "number"
      ? record.totalLines
      : typeof record.total_lines === "number"
        ? record.total_lines
        : undefined;
  const totalBytes =
    typeof record.totalBytes === "number"
      ? record.totalBytes
      : typeof record.total_bytes === "number"
        ? record.total_bytes
        : undefined;
  if (!reason && !spillPath && totalLines === undefined && totalBytes === undefined) {
    return null;
  }
  return { reason, spillPath, totalLines, totalBytes };
}

export function extractStreamTruncations(
  details?: Record<string, unknown>,
): { stdout: ObservationTruncation | null; stderr: ObservationTruncation | null } {
  if (!details) {
    return { stdout: null, stderr: null };
  }
  const topLevel = readTruncation(details.truncation);
  if (topLevel) {
    return { stdout: topLevel, stderr: null };
  }
  return {
    stdout: readTruncation(details.stdout),
    stderr: readTruncation(details.stderr),
  };
}

export function extractExitCode(details?: Record<string, unknown>): number | null {
  if (!details) {
    return null;
  }
  const code = details.exitCode ?? details.exit_code;
  return typeof code === "number" ? code : null;
}

export function artifactSpillPath(artifact: ChatAgentArtifact): string | null {
  const metadata = asRecord(artifact.metadata);
  if (!metadata) {
    return null;
  }
  if (typeof metadata.spillPath === "string") {
    return metadata.spillPath;
  }
  if (typeof metadata.spill_path === "string") {
    return metadata.spill_path;
  }
  return null;
}

export function shouldShowObservationDetails(observation: ChatAgentObservation): boolean {
  if (observation.artifacts && observation.artifacts.length > 0) {
    return true;
  }
  if (!observation.details) {
    return false;
  }
  const { stdout, stderr } = extractStreamTruncations(observation.details);
  return Boolean(stdout || stderr || extractExitCode(observation.details));
}
