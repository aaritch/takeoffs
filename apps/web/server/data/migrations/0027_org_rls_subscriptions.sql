-- Org isolation for the subscriptions table (P4-01). Fail-closed RLS like every other
-- customer-owned table; the org-isolation guard test fails the build if an org_id table is left
-- uncovered. (billing_events has no org_id — it's a platform-global provider-event ledger — so it is
-- correctly exempt, like pricing_rules.)
SELECT enable_org_rls('subscriptions');
