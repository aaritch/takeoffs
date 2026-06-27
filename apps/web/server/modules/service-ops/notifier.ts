import { getLogger } from '../../platform/observability';

/**
 * Order lifecycle notifications (P3-07). Delivery, acceptance, and dispute each notify the customer.
 * The transport (email/in-app) is abstracted behind this interface; the default logs, and the real
 * notifier (Phase 5 webhooks / Phase 4 billing receipts) drops in without touching the services.
 */
export interface OrderNotice {
  orderId: string;
  orgId: string;
}

export interface OrderNotifier {
  delivered(n: OrderNotice): Promise<void> | void;
  accepted(n: OrderNotice): Promise<void> | void;
  disputed(n: OrderNotice & { reason: string }): Promise<void> | void;
}

export const loggingOrderNotifier: OrderNotifier = {
  delivered: (n) => void getLogger().info('order delivered', { event: 'order_delivered', ...n }),
  accepted: (n) => void getLogger().info('order accepted', { event: 'order_accepted', ...n }),
  disputed: (n) =>
    void getLogger().info('order disputed', { event: 'order_disputed', orderId: n.orderId }),
};
