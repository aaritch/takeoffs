-- Org isolation + true append-only for the retainer ledger (P4-03).
-- RLS: fail-closed like every other customer-owned (org_id) table; the org-isolation guard fails the
-- build if it's left uncovered.
SELECT enable_org_rls('retainer_ledger_entries');
--> statement-breakpoint
-- Immutability: the ledger is the auditable record the balance reconciles to, so altering it must be
-- rejected at the DATABASE level — even a superuser UPDATE/DELETE raises (the caveat: never change a
-- balance without a ledger entry, and never rewrite history). INSERT and TRUNCATE are unaffected.
CREATE OR REPLACE FUNCTION reject_retainer_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'retainer_ledger_entries is an append-only ledger; % is not allowed', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER retainer_ledger_no_update BEFORE UPDATE ON retainer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_retainer_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER retainer_ledger_no_delete BEFORE DELETE ON retainer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_retainer_ledger_mutation();
