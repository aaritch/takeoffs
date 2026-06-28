/**
 * Webhook HTTP sender seam (P5-03). Delivery depends on this interface, not `fetch` directly, so the
 * retry/idempotency logic is testable with a scripted sender and the real transport is a drop-in.
 */
export interface WebhookRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface WebhookSendResult {
  /** HTTP status code, or null for a network/timeout error (treated as transient). */
  statusCode: number | null;
  ok: boolean;
  error?: string;
}

export interface WebhookSender {
  send(req: WebhookRequest): Promise<WebhookSendResult>;
}

/** Real sender: POST JSON with a bounded timeout; a thrown/timeout error → null status (transient). */
export const httpWebhookSender: WebhookSender = {
  async send(req) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(req.url, {
          method: 'POST',
          headers: req.headers,
          body: req.body,
          signal: controller.signal,
        });
        return { statusCode: res.status, ok: res.ok };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      return {
        statusCode: null,
        ok: false,
        error: err instanceof Error ? err.message : 'send failed',
      };
    }
  },
};
