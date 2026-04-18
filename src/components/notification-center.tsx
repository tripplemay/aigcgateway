"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { StatusChip } from "./status-chip";
import type { StatusChipVariant } from "./status-chip";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { formatCNY, timeAgo } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

type EventType =
  | "BALANCE_LOW"
  | "SPENDING_RATE_EXCEEDED"
  | "CHANNEL_DOWN"
  | "CHANNEL_RECOVERED"
  | "PENDING_CLASSIFICATION";

interface NotificationItem {
  id: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  projectId: string | null;
}

// ── Event meta (icon + color variant) ───────────────────────

const EVENT_META: Record<
  EventType,
  { icon: string; variant: StatusChipVariant; labelKey: string }
> = {
  BALANCE_LOW: { icon: "account_balance_wallet", variant: "error", labelKey: "balanceLow" },
  SPENDING_RATE_EXCEEDED: { icon: "speed", variant: "warning", labelKey: "spendingRate" },
  CHANNEL_DOWN: { icon: "cloud_off", variant: "error", labelKey: "channelDown" },
  CHANNEL_RECOVERED: { icon: "cloud_done", variant: "success", labelKey: "channelRecovered" },
  PENDING_CLASSIFICATION: { icon: "pending_actions", variant: "info", labelKey: "pendingClass" },
};

// ── Summary text ─────────────────────────────────────────────

function buildSummary(
  eventType: EventType,
  payload: Record<string, unknown>,
  fmtCny: (usd: number, d?: number) => string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (eventType) {
    case "BALANCE_LOW":
      return t("summaryBalanceLow", {
        current: fmtCny(Number(payload.currentBalance ?? 0)),
        threshold: fmtCny(Number(payload.threshold ?? 0)),
      });
    case "SPENDING_RATE_EXCEEDED":
      return t("summarySpendingRate", {
        spent: fmtCny(Number(payload.spent ?? 0), 4),
        limit: fmtCny(Number(payload.limit ?? 0)),
      });
    case "CHANNEL_DOWN":
      return t("summaryChannelDown", {
        provider: String(payload.providerName ?? ""),
        model: String(payload.modelName ?? ""),
      });
    case "CHANNEL_RECOVERED":
      return t("summaryChannelRecovered", {
        provider: String(payload.providerName ?? ""),
        model: String(payload.modelName ?? ""),
      });
    case "PENDING_CLASSIFICATION":
      return t("summaryPendingClass", { count: Number(payload.count ?? 0) });
    default:
      return "";
  }
}

// ── Main component ────────────────────────────────────────────

export function NotificationCenter() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const exchangeRate = useExchangeRate();
  const fmtCny = useCallback(
    (usd: number, d = 2) => formatCNY(usd, exchangeRate, d),
    [exchangeRate],
  );
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch("/api/notifications?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: NotificationItem[];
        unreadCount: number;
      };
      setNotifications(json.data);
      setUnreadCount(json.unreadCount);
    } catch {
      /* best-effort */
    }
  }, []);

  // Initial fetch + 30-second polling, paused when tab is hidden
  useEffect(() => {
    void fetchNotifications();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void fetchNotifications(), 30_000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    if (typeof document !== "undefined" && document.hidden) {
      // Tab hidden at mount: don't start polling yet
    } else {
      start();
    }
    const handleVis = () => {
      if (document.hidden) {
        stop();
      } else {
        void fetchNotifications();
        start();
      }
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [fetchNotifications]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* best-effort */
    }
  };

  const markAllRead = async () => {
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/notifications/mark-all-read", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      /* best-effort */
    }
  };

  const handleItemClick = (n: NotificationItem) => {
    if (!n.readAt) void markRead(n.id);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-ds-outline hover:bg-ds-surface-container-high rounded-full transition-colors"
        aria-label={t("toggle")}
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-ds-error text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-12 w-96 bg-ds-surface-container-lowest rounded-2xl shadow-xl border border-ds-outline-variant/20 z-50 flex flex-col max-h-[480px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ds-outline-variant/10">
            <span className="text-sm font-semibold text-ds-on-surface">{t("title")}</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-ds-primary hover:underline"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-ds-outline gap-2">
                <span className="material-symbols-outlined text-3xl">notifications_none</span>
                <span className="text-sm">{t("empty")}</span>
              </div>
            ) : (
              notifications.map((n) => {
                const meta = EVENT_META[n.eventType];
                const isUnread = !n.readAt;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-ds-surface-container-low border-b border-ds-outline-variant/5 last:border-0 ${
                      isUnread ? "bg-ds-primary-container/10" : ""
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        meta.variant === "error"
                          ? "bg-ds-error-container text-ds-error"
                          : meta.variant === "warning"
                            ? "bg-ds-tertiary-container text-ds-on-tertiary-container"
                            : meta.variant === "success"
                              ? "bg-ds-secondary-container text-ds-on-secondary-container"
                              : "bg-ds-primary-container text-ds-primary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{meta.icon}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusChip variant={meta.variant}>{t(meta.labelKey)}</StatusChip>
                        {isUnread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-ds-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-ds-on-surface-variant truncate">
                        {buildSummary(n.eventType, n.payload, fmtCny, t)}
                      </p>
                      <p className="text-[10px] text-ds-outline mt-0.5">
                        {timeAgo(n.createdAt, locale)}
                      </p>
                    </div>

                    {/* Mark read button */}
                    {isUnread && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void markRead(n.id);
                        }}
                        className="shrink-0 p-1 text-ds-outline hover:text-ds-primary transition-colors"
                        title={t("markRead")}
                      >
                        <span className="material-symbols-outlined text-sm">done</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
