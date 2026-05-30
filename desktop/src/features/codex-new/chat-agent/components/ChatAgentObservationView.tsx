import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { ChatAgentObservation } from "../types";
import {
  artifactSpillPath,
  extractExitCode,
  extractStreamTruncations,
  shouldShowObservationDetails,
} from "../utils/observationPresentation";

type ChatAgentObservationViewProps = {
  observation: ChatAgentObservation;
};

function TruncationNote({
  label,
  truncation,
}: {
  label: string;
  truncation: { reason?: string; spillPath?: string; totalLines?: number; totalBytes?: number };
}) {
  return (
    <div className="chat-agent-observation__truncation">
      <div className="chat-agent-observation__truncation-label">{label}</div>
      {truncation.reason ? <p>{truncation.reason}</p> : null}
      {truncation.spillPath ? (
        <p className="chat-agent-observation__path">
          <span>Full output: </span>
          <code>{truncation.spillPath}</code>
        </p>
      ) : null}
      {truncation.totalLines !== undefined || truncation.totalBytes !== undefined ? (
        <p className="chat-agent-observation__meta">
          {truncation.totalLines !== undefined ? `${truncation.totalLines} lines` : null}
          {truncation.totalLines !== undefined && truncation.totalBytes !== undefined
            ? " · "
            : null}
          {truncation.totalBytes !== undefined ? `${truncation.totalBytes} bytes` : null}
        </p>
      ) : null}
    </div>
  );
}

export function ChatAgentObservationView({ observation }: ChatAgentObservationViewProps) {
  const { resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const [expanded, setExpanded] = useState(false);

  if (!shouldShowObservationDetails(observation)) {
    return null;
  }

  const { stdout, stderr } = extractStreamTruncations(observation.details);
  const exitCode = extractExitCode(observation.details);
  const artifacts = observation.artifacts ?? [];

  return (
    <div className="chat-agent-observation">
      <button
        type="button"
        className="chat-agent-observation__toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded
          ? isChinese
            ? "收起详情"
            : "Hide details"
          : isChinese
            ? "展开详情"
            : "Show details"}
      </button>
      {expanded ? (
        <div className="chat-agent-observation__body">
          {exitCode !== null ? (
            <p className="chat-agent-observation__meta">
              {isChinese ? "退出码" : "Exit code"}: {exitCode}
            </p>
          ) : null}
          {stdout ? <TruncationNote label="stdout" truncation={stdout} /> : null}
          {stderr ? <TruncationNote label="stderr" truncation={stderr} /> : null}
          {artifacts.map((artifact, index) => {
            const spillPath = artifactSpillPath(artifact);
            const preview =
              artifact.content.length > 1200
                ? `${artifact.content.slice(0, 1200)}\n…`
                : artifact.content;
            return (
              <div key={`${artifact.kind}-${index}`} className="chat-agent-observation__artifact">
                <div className="chat-agent-observation__artifact-label">{artifact.kind}</div>
                {spillPath ? (
                  <p className="chat-agent-observation__path">
                    <code>{spillPath}</code>
                  </p>
                ) : null}
                {preview.trim() ? <pre>{preview}</pre> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
