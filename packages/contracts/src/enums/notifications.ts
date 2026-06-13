import { z } from 'zod';

/**
 * Notification delivery channel (spec §5.7 / §6.7, Notification.channel). Each notification
 * type has a channel policy: in-app always; email for high-signal events; webhook for orgs
 * that configure one.
 */
export const NotificationChannel = z.enum(['IN_APP', 'EMAIL', 'WEBHOOK']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

/**
 * Notification event types (spec §6.7). The set of events that notify users; drives the
 * per-type channel policy and email-frequency preferences.
 */
export const NotificationType = z.enum([
  'PLAN_SET_PROCESSED',
  'AI_TAKEOFF_COMPLETED',
  'ORDER_STATUS_CHANGED',
  'ORDER_ASSIGNED',
  'ORDER_DELIVERED',
  'MEMBER_INVITED',
  'PAYMENT_FAILED',
]);
export type NotificationType = z.infer<typeof NotificationType>;
