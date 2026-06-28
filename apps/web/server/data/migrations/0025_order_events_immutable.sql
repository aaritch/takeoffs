-- Make the order_events audit trail truly append-only (P3-09). The trail is the basis for dispute
-- resolution and trust, so altering it must be rejected at the DATABASE level, not just by
-- convention — even a superuser UPDATE/DELETE raises. INSERT (append) and TRUNCATE (test reset, which
-- does not fire row triggers) are unaffected.
CREATE OR REPLACE FUNCTION reject_order_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_events is an append-only audit log; % is not allowed', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_events_no_update BEFORE UPDATE ON order_events
  FOR EACH ROW EXECUTE FUNCTION reject_order_event_mutation();
--> statement-breakpoint
CREATE TRIGGER order_events_no_delete BEFORE DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION reject_order_event_mutation();
