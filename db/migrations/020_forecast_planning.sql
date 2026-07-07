-- Time-aware forecasting. Two new product planning fields:
--
--  * lead_time_days       — how long this item takes to replenish (produce or
--                           buy). Owner-editable; drives the production-order
--                           deadline and the dynamic reorder point below.
--  * computed_reorder_point — maintained by the daily cron: the larger of the
--                           demand over the replenishment window
--                           (velocity_per_day × (lead_time_days + 14)) and a
--                           movement-tier floor (30 for an item sold in the last
--                           30 days, else 10). NULL until first computed. The
--                           effective auto-reorder trigger is
--                           GREATEST(reorder_point, computed_reorder_point), so
--                           the manual reorder_point stays a floor the owner
--                           controls while fast movers trigger earlier.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS lead_time_days         INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS computed_reorder_point INTEGER;
