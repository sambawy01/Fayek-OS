-- Per-product unit cost (EGP), the missing input for cost-of-goods / gross
-- margin. priceEgp is the SALE price; cost_egp is what the unit costs us to
-- produce/buy. The finance P&L computes COGS = units sold × cost_egp and a
-- Gross Profit line from it. Defaults to 0 (unknown/unset) so existing rows and
-- untracked items simply contribute no COGS until a cost is entered.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_egp INTEGER NOT NULL DEFAULT 0;
