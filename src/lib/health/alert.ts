/**
 * 告警推送
 *
 * 通道状态变更时调用 ALERT_WEBHOOK_URL
 */

export interface AlertPayload {
  event: "channel_status_changed";
  channelId: string;
  providerName: string;
  modelName: string;
  oldStatus: string;
  newStatus: string;
  errorMessage: string | null;
  timestamp: string;
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[health-alert] webhook failed:", (err as Error).message);
  }
}
