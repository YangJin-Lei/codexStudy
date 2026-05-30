const LEDGER_KEY = "chat-agent.mirror-ledger.v1";

type MirrorLedger = Record<string, string[]>;

function readLedger(): MirrorLedger {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as MirrorLedger;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger: MirrorLedger) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Best-effort persistence.
  }
}

export function wasChatAgentMirrorKeyRecorded(key: string): boolean {
  const ledger = readLedger();
  return Object.values(ledger).some((keys) => keys.includes(key));
}

export function recordChatAgentMirrorKey(runId: string, key: string) {
  const ledger = readLedger();
  const existing = ledger[runId] ?? [];
  if (existing.includes(key)) {
    return;
  }
  writeLedger({
    ...ledger,
    [runId]: [...existing, key],
  });
}

export function listChatAgentMirrorKeysForRun(runId: string): string[] {
  return readLedger()[runId] ?? [];
}
