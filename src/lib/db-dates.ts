/**
 * Normalize date/timestamp values coming back from the Neon driver.
 *
 * The `@neondatabase/serverless` driver parses DATE/TIMESTAMPTZ columns into JS
 * `Date` objects. Those must never reach a React child directly (rendering a
 * Date throws React error #31) and are awkward across the RSC boundary, so DALs
 * coerce them to plain strings here.
 */

/** "YYYY-MM-DD" for a Date or ISO-ish string; null when empty. */
export function dateOnly(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** ISO timestamp string for a Date or passthrough string; "" when empty. */
export function isoString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
