import type {
  AccountSnapshot,
  LocalUsageDay,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../types";
import { formatRelativeTime } from "../../utils/time";
import { getUsageLabels } from "../app/utils/usageLabels";
import {
  buildWindowCaption,
  formatAccountTypeLabel,
  formatCompactNumber,
  formatCount,
  formatCreditsBalance,
  formatDayCount,
  formatDayLabel,
  formatDuration,
  formatDurationCompact,
  formatPlanType,
  isUsageDayActive,
} from "./homeFormatters";
import type { HomeStatCard, UsageMetric } from "./homeTypes";

type UsageTranslate = (key: string, fallback: string) => string;

type HomeUsageViewModel = {
  accountCards: HomeStatCard[];
  accountMeta: string | null;
  updatedLabel: string | null;
  usageCards: HomeStatCard[];
  usageDays: LocalUsageDay[];
  usageInsights: HomeStatCard[];
};

export function buildHomeUsageViewModel({
  accountInfo,
  accountRateLimits,
  localUsageSnapshot,
  usageMetric,
  usageShowRemaining,
  translate = (_key, fallback) => fallback,
}: {
  accountInfo: AccountSnapshot | null;
  accountRateLimits: RateLimitSnapshot | null;
  localUsageSnapshot: LocalUsageSnapshot | null;
  usageMetric: UsageMetric;
  usageShowRemaining: boolean;
  translate?: UsageTranslate;
}): HomeUsageViewModel {
  const tr = translate;
  const usageTotals = localUsageSnapshot?.totals ?? null;
  const usageDays = localUsageSnapshot?.days ?? [];
  const latestUsageDay = usageDays[usageDays.length - 1] ?? null;
  const last7Days = usageDays.slice(-7);
  const last7Tokens = last7Days.reduce((total, day) => total + day.totalTokens, 0);
  const last7Input = last7Days.reduce((total, day) => total + day.inputTokens, 0);
  const last7Cached = last7Days.reduce(
    (total, day) => total + day.cachedInputTokens,
    0,
  );
  const last7AgentMs = last7Days.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const last30AgentMs = usageDays.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const averageDailyAgentMs =
    last7Days.length > 0 ? Math.round(last7AgentMs / last7Days.length) : 0;
  const last7AgentRuns = last7Days.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const last30AgentRuns = usageDays.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const averageTokensPerRun =
    last7AgentRuns > 0 ? Math.round(last7Tokens / last7AgentRuns) : null;
  const averageRunDurationMs =
    last7AgentRuns > 0 ? Math.round(last7AgentMs / last7AgentRuns) : null;
  const last7ActiveDays = last7Days.filter(isUsageDayActive).length;
  const last30ActiveDays = usageDays.filter(isUsageDayActive).length;
  const averageActiveDayAgentMs =
    last7ActiveDays > 0 ? Math.round(last7AgentMs / last7ActiveDays) : null;
  const peakAgentDay = usageDays.reduce<
    | { day: string; agentTimeMs: number }
    | null
  >((best, day) => {
    const value = day.agentTimeMs ?? 0;
    if (value <= 0) {
      return best;
    }
    if (!best || value > best.agentTimeMs) {
      return { day: day.day, agentTimeMs: value };
    }
    return best;
  }, null);

  let longestStreak = 0;
  let runningStreak = 0;
  for (const day of usageDays) {
    if (isUsageDayActive(day)) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  const usageCards: HomeStatCard[] =
    usageMetric === "tokens"
      ? [
          {
            label: tr("home.usage.today", "Today"),
            value: formatCompactNumber(latestUsageDay?.totalTokens ?? 0),
            suffix: tr("home.usage.suffix.tokens", "tokens"),
            caption: latestUsageDay
              ? `${formatDayLabel(latestUsageDay.day)} · ${formatCount(
                  latestUsageDay.inputTokens,
                )} ${tr("home.usage.in", "in")} / ${formatCount(latestUsageDay.outputTokens)} ${tr("home.usage.out", "out")}`
              : tr("home.usage.latestAvailableDay", "Latest available day"),
          },
          {
            label: tr("home.usage.last7Days", "Last 7 days"),
            value: formatCompactNumber(usageTotals?.last7DaysTokens ?? last7Tokens),
            suffix: tr("home.usage.suffix.tokens", "tokens"),
            caption: `${tr("home.usage.avg", "Avg")} ${formatCompactNumber(usageTotals?.averageDailyTokens)} / ${tr("home.usage.day", "day")}`,
          },
          {
            label: tr("home.usage.last30Days", "Last 30 days"),
            value: formatCompactNumber(usageTotals?.last30DaysTokens ?? last7Tokens),
            suffix: tr("home.usage.suffix.tokens", "tokens"),
            caption: `${tr("home.usage.total", "Total")} ${formatCount(usageTotals?.last30DaysTokens ?? last7Tokens)}`,
          },
          {
            label: tr("home.usage.cacheHitRate", "Cache hit rate"),
            value: usageTotals
              ? `${usageTotals.cacheHitRatePercent.toFixed(1)}%`
              : "--",
            caption: tr("home.usage.last7DaysCaption", "Last 7 days"),
          },
          {
            label: tr("home.usage.cachedTokens", "Cached tokens"),
            value: formatCompactNumber(last7Cached),
            suffix: tr("home.usage.suffix.saved", "saved"),
            caption:
              last7Input > 0
                ? `${((last7Cached / last7Input) * 100).toFixed(1)}% ${tr("home.usage.ofPromptTokens", "of prompt tokens")}`
                : tr("home.usage.last7DaysCaption", "Last 7 days"),
          },
          {
            label: tr("home.usage.avgPerRun", "Avg / run"),
            value:
              averageTokensPerRun === null
                ? "--"
                : formatCompactNumber(averageTokensPerRun),
            suffix: tr("home.usage.suffix.tokens", "tokens"),
            caption:
              last7AgentRuns > 0
                ? `${formatCount(last7AgentRuns)} ${tr("home.usage.runsInLast7Days", "runs in last 7 days")}`
                : tr("home.usage.noRunsYet", "No runs yet"),
          },
          {
            label: tr("home.usage.peakDay", "Peak day"),
            value: formatDayLabel(usageTotals?.peakDay),
            caption: `${formatCompactNumber(usageTotals?.peakDayTokens)} ${tr("home.usage.suffix.tokens", "tokens")}`,
          },
        ]
      : [
          {
            label: tr("home.usage.last7Days", "Last 7 days"),
            value: formatDurationCompact(last7AgentMs),
            suffix: tr("home.usage.suffix.agentTime", "agent time"),
            caption: `${tr("home.usage.avg", "Avg")} ${formatDurationCompact(averageDailyAgentMs)} / ${tr("home.usage.day", "day")}`,
          },
          {
            label: tr("home.usage.last30Days", "Last 30 days"),
            value: formatDurationCompact(last30AgentMs),
            suffix: tr("home.usage.suffix.agentTime", "agent time"),
            caption: `${tr("home.usage.total", "Total")} ${formatDuration(last30AgentMs)}`,
          },
          {
            label: tr("home.usage.runs", "Runs"),
            value: formatCount(last7AgentRuns),
            suffix: tr("home.usage.suffix.runs", "runs"),
            caption: `${tr("home.usage.last30DaysCaption", "Last 30 days")}: ${formatCount(last30AgentRuns)} ${tr("home.usage.suffix.runs", "runs")}`,
          },
          {
            label: tr("home.usage.avgPerRun", "Avg / run"),
            value: formatDurationCompact(averageRunDurationMs),
            caption:
              last7AgentRuns > 0
                ? `${tr("home.usage.acrossRunsPrefix", "Across")} ${formatCount(last7AgentRuns)} ${tr("home.usage.suffix.runs", "runs")}`
                : tr("home.usage.noRunsYet", "No runs yet"),
          },
          {
            label: tr("home.usage.avgActiveDay", "Avg / active day"),
            value: formatDurationCompact(averageActiveDayAgentMs),
            caption:
              last7ActiveDays > 0
                ? `${formatCount(last7ActiveDays)} ${tr("home.usage.activeDaysInLast7", "active days in last 7")}`
                : tr("home.usage.noActiveDaysYet", "No active days yet"),
          },
          {
            label: tr("home.usage.peakDay", "Peak day"),
            value: formatDayLabel(peakAgentDay?.day ?? null),
            caption: `${formatDurationCompact(peakAgentDay?.agentTimeMs ?? 0)} ${tr("home.usage.suffix.agentTime", "agent time")}`,
          },
        ];

  const usageInsights = [
    {
      label: tr("home.usage.longestStreak", "Longest streak"),
      value: longestStreak > 0 ? formatDayCount(longestStreak) : "--",
      caption:
        longestStreak > 0
          ? tr("home.usage.acrossCurrentRange", "Across current usage range")
          : tr("home.usage.noActiveStreakYet", "No active streak yet"),
      compact: true,
    },
    {
      label: tr("home.usage.activeDays", "Active days"),
      value: last7Days.length > 0 ? `${last7ActiveDays} / ${last7Days.length}` : "--",
      caption:
        usageDays.length > 0
          ? `${last30ActiveDays} / ${usageDays.length} ${tr("home.usage.inCurrentRange", "in current range")}`
          : tr("home.usage.noActivityYet", "No activity yet"),
      compact: true,
    },
  ] satisfies HomeStatCard[];

  const usagePercentLabels = getUsageLabels(accountRateLimits, usageShowRemaining);
  const planLabel = formatPlanType(accountRateLimits?.planType ?? accountInfo?.planType);
  const creditsBalance = formatCreditsBalance(accountRateLimits?.credits?.balance);
  const accountCards: HomeStatCard[] = [];

  if (usagePercentLabels.sessionPercent !== null) {
    accountCards.push({
      label: usageShowRemaining
        ? tr("home.usage.sessionLeft", "Session left")
        : tr("home.usage.sessionUsage", "Session usage"),
      value: `${usagePercentLabels.sessionPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.sessionResetLabel,
        accountRateLimits?.primary?.windowDurationMins,
        tr("home.usage.currentWindow", "Current window"),
      ),
    });
  }

  if (usagePercentLabels.showWeekly && usagePercentLabels.weeklyPercent !== null) {
    accountCards.push({
      label: usageShowRemaining
        ? tr("home.usage.weeklyLeft", "Weekly left")
        : tr("home.usage.weeklyUsage", "Weekly usage"),
      value: `${usagePercentLabels.weeklyPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.weeklyResetLabel,
        accountRateLimits?.secondary?.windowDurationMins,
        tr("home.usage.longerWindow", "Longer window"),
      ),
    });
  }

  if (accountRateLimits?.credits?.hasCredits) {
    accountCards.push(
      accountRateLimits.credits.unlimited
        ? {
            label: tr("home.usage.credits", "Credits"),
            value: tr("home.usage.unlimited", "Unlimited"),
            caption: tr("home.usage.availableBalance", "Available balance"),
          }
        : {
            label: tr("home.usage.credits", "Credits"),
            value: creditsBalance ?? "--",
            suffix: creditsBalance ? tr("home.usage.suffix.credits", "credits") : null,
            caption: tr("home.usage.availableBalance", "Available balance"),
          },
    );
  }

  if (planLabel) {
    accountCards.push({
      label: tr("home.usage.plan", "Plan"),
      value: planLabel,
      caption: formatAccountTypeLabel(accountInfo?.type),
    });
  }

  return {
    accountCards,
    accountMeta: accountInfo?.email ?? null,
    updatedLabel: localUsageSnapshot
      ? `${tr("home.usage.updatedPrefix", "Updated")} ${formatRelativeTime(localUsageSnapshot.updatedAt)}`
      : null,
    usageCards,
    usageDays,
    usageInsights,
  };
}
