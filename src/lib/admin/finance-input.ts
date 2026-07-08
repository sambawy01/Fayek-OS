import {
  categoriesFor,
  isValidDateKey,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RECUR_FREQUENCIES,
  type LedgerDirection,
  type LedgerExtras,
  type LedgerLineItem,
  type LedgerLinks,
  type LedgerPatch,
  type NewLedgerEntry,
  type PaymentMethod,
  type PaymentStatus,
  type RecurFrequency,
} from "@/lib/finance";

/**
 * Validation for admin finance writes (POST create / PUT update), mirroring
 * @/lib/admin/catalog-input.
 *
 * - `create` requires direction, category (valid for that direction), a
 *   positive amount, a method and a real date; note/receiptUrl optional.
 * - `update` is partial: only provided keys are validated and applied. The
 *   id, createdAt and source fields are never client-writable. When a partial
 *   update changes `direction`, a `category` must be supplied too (so the
 *   category can be re-checked against the new direction).
 */

const MAX_NOTE = 1000;
const MAX_RECEIPT_URL = 600;
const MAX_AMOUNT = 100_000_000;
const MAX_VENDOR = 200;
const MAX_REFERENCE = 100;
const MAX_COSTCENTER = 100;
const MAX_LINE_DESC = 200;
const MAX_LINEITEMS = 50;

export type ValidationResult =
  | { ok: true; value: NewLedgerEntry | LedgerPatch }
  | { ok: false; fields: Record<string, string> };

function str(v: unknown): string | null {
  return typeof v === "string" ? v.trim() : null;
}

function validateDirection(
  raw: unknown,
  required: boolean,
  fields: Record<string, string>
): LedgerDirection | undefined {
  if (raw === undefined) {
    if (required) fields.direction = "direction is required";
    return undefined;
  }
  if (raw === "expense" || raw === "income") return raw;
  fields.direction = 'direction must be "expense" or "income"';
  return undefined;
}

function validateAmount(
  raw: unknown,
  required: boolean,
  fields: Record<string, string>
): number | undefined {
  if (raw === undefined) {
    if (required) fields.amountEgp = "amountEgp is required";
    return undefined;
  }
  // Accept numeric strings (the assistant and form both can send them).
  let num = raw;
  if (typeof num === "string" && num.trim() !== "" && Number.isFinite(Number(num))) {
    num = Number(num);
  }
  if (
    typeof num !== "number" ||
    !Number.isFinite(num) ||
    num <= 0 ||
    num > MAX_AMOUNT
  ) {
    fields.amountEgp = `amountEgp must be a number between 0 and ${MAX_AMOUNT}`;
    return undefined;
  }
  // Money to 2 decimal places — avoids float dust in stored totals.
  return Math.round(num * 100) / 100;
}

function validateMethod(
  raw: unknown,
  required: boolean,
  fields: Record<string, string>
): PaymentMethod | undefined {
  if (raw === undefined) {
    if (required) fields.method = "method is required";
    return undefined;
  }
  if (typeof raw === "string" && (PAYMENT_METHODS as readonly string[]).includes(raw)) {
    return raw as PaymentMethod;
  }
  fields.method = `method must be one of: ${PAYMENT_METHODS.join(", ")}`;
  return undefined;
}

function validateReceiptUrl(
  raw: unknown,
  fields: Record<string, string>
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const url = str(raw);
  if (url === null || url.length > MAX_RECEIPT_URL) {
    fields.receiptUrl = `receiptUrl must be a string of at most ${MAX_RECEIPT_URL} characters, or null`;
    return undefined;
  }
  if (url === "") return null;
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) {
    fields.receiptUrl = "receiptUrl must be an https:// URL";
    return undefined;
  }
  return url;
}

function boundedStr(
  raw: unknown, max: number, key: string, fields: Record<string, string>
): string | undefined {
  if (raw === undefined) return undefined;
  const s = str(raw);
  if (s === null || s.length > max) {
    fields[key] = `${key} must be a string of at most ${max} characters`;
    return undefined;
  }
  return s;
}

function boundedNum(
  raw: unknown, min: number, max: number, key: string, fields: Record<string, string>
): number | undefined {
  if (raw === undefined) return undefined;
  let n: unknown = raw;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) n = Number(n);
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
    fields[key] = `${key} must be a number between ${min} and ${max}`;
    return undefined;
  }
  return Math.round(n * 100) / 100;
}

/**
 * Validate the optional standard-bookkeeping fields shared by create & update.
 * `amountEgp` (when known) bounds amountPaidEgp. Accumulates errors into `fields`
 * and returns only the well-formed, provided keys.
 */
function validateExtras(
  b: Record<string, unknown>, amountEgp: number | undefined, create: boolean, fields: Record<string, string>
): LedgerExtras {
  const extras: LedgerExtras = {};

  const vendor = boundedStr(b.vendor, MAX_VENDOR, "vendor", fields);
  if (vendor !== undefined) extras.vendor = vendor;
  const reference = boundedStr(b.reference, MAX_REFERENCE, "reference", fields);
  if (reference !== undefined) extras.reference = reference;
  const costCenter = boundedStr(b.costCenter, MAX_COSTCENTER, "costCenter", fields);
  if (costCenter !== undefined) extras.costCenter = costCenter;

  const taxRatePct = boundedNum(b.taxRatePct, 0, 100, "taxRatePct", fields);
  if (taxRatePct !== undefined) extras.taxRatePct = taxRatePct;

  if (b.currency !== undefined) {
    const c = (str(b.currency) ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) fields.currency = "currency must be a 3-letter ISO code";
    else extras.currency = c;
  }

  // Payment status + paid amount + due date (with conditional requirements).
  let status: PaymentStatus | undefined;
  if (b.paymentStatus !== undefined) {
    if ((PAYMENT_STATUSES as readonly string[]).includes(b.paymentStatus as string)) {
      status = b.paymentStatus as PaymentStatus;
      extras.paymentStatus = status;
    } else {
      fields.paymentStatus = `paymentStatus must be one of: ${PAYMENT_STATUSES.join(", ")}`;
    }
  }
  const amountPaidEgp = boundedNum(b.amountPaidEgp, 0, MAX_AMOUNT, "amountPaidEgp", fields);
  if (amountPaidEgp !== undefined) {
    if (amountEgp !== undefined && amountPaidEgp > amountEgp) {
      fields.amountPaidEgp = "amountPaidEgp cannot exceed amountEgp";
    } else {
      extras.amountPaidEgp = amountPaidEgp;
    }
  }
  // Conditional-required only on CREATE — a partial UPDATE that changes one
  // field must not demand amountPaidEgp/dueDate that already live on the entry.
  if (create && status === "partial" && b.amountPaidEgp === undefined) {
    fields.amountPaidEgp = "amountPaidEgp is required for a partial payment";
  }
  if (b.dueDate !== undefined) {
    if (b.dueDate === null || b.dueDate === "") extras.dueDate = null;
    else {
      const dd = str(b.dueDate) ?? "";
      if (!isValidDateKey(dd)) fields.dueDate = "dueDate must be a real date in YYYY-MM-DD form";
      else extras.dueDate = dd;
    }
  }
  if (create && (status === "unpaid" || status === "partial") && b.dueDate === undefined) {
    fields.dueDate = "dueDate is required for an unpaid/partial entry";
  }

  // Line items.
  if (b.lineItems !== undefined) {
    if (!Array.isArray(b.lineItems)) {
      fields.lineItems = "lineItems must be an array";
    } else if (b.lineItems.length > MAX_LINEITEMS) {
      fields.lineItems = `at most ${MAX_LINEITEMS} line items`;
    } else {
      const items: LedgerLineItem[] = [];
      let bad = false;
      for (const raw of b.lineItems) {
        const r = (raw ?? {}) as Record<string, unknown>;
        const desc = str(r.description) ?? "";
        const qty = Number(r.qty);
        const unit = Number(r.unitPriceEgp);
        if (!desc || desc.length > MAX_LINE_DESC || !(qty > 0) || !(unit >= 0) ||
            !Number.isFinite(qty) || !Number.isFinite(unit)) { bad = true; break; }
        const item: LedgerLineItem = {
          description: desc, qty: Math.round(qty * 100) / 100, unitPriceEgp: Math.round(unit * 100) / 100,
        };
        const slug = str(r.slug);
        if (slug) item.slug = slug;
        items.push(item);
      }
      if (bad) fields.lineItems = "each line item needs a description, qty > 0 and unitPriceEgp ≥ 0";
      else extras.lineItems = items;
    }
  }

  // Links.
  if (b.links !== undefined && b.links !== null) {
    const l = b.links as Record<string, unknown>;
    const links: LedgerLinks = {};
    if (l.poId !== undefined && Number.isFinite(Number(l.poId))) links.poId = Math.round(Number(l.poId));
    if (l.batchId !== undefined && Number.isFinite(Number(l.batchId))) links.batchId = Math.round(Number(l.batchId));
    const lslug = str(l.slug);
    if (lslug) links.slug = lslug;
    if (Object.keys(links).length) extras.links = links;
  }

  // Recurrence template.
  if (b.recurring !== undefined) {
    if (b.recurring === null) {
      extras.recurring = null;
    } else {
      const r = (b.recurring ?? {}) as Record<string, unknown>;
      const nextDate = str(r.nextDate) ?? "";
      if (!(RECUR_FREQUENCIES as readonly string[]).includes(r.frequency as string)) {
        fields.recurring = `recurring.frequency must be one of: ${RECUR_FREQUENCIES.join(", ")}`;
      } else if (!isValidDateKey(nextDate)) {
        fields.recurring = "recurring.nextDate must be a real date in YYYY-MM-DD form";
      } else {
        extras.recurring = { frequency: r.frequency as RecurFrequency, nextDate, active: r.active !== false };
      }
    }
  }

  return extras;
}

export function validateLedgerInput(
  body: unknown,
  mode: "create" | "update"
): ValidationResult {
  const fields: Record<string, string> = {};
  const b = (body ?? {}) as Record<string, unknown>;
  const create = mode === "create";

  const direction = validateDirection(b.direction, create, fields);
  const amountEgp = validateAmount(b.amountEgp, create, fields);
  const method = validateMethod(b.method, create, fields);

  // Date.
  let date: string | undefined;
  if (b.date !== undefined) {
    const d = str(b.date) ?? "";
    if (!isValidDateKey(d)) {
      fields.date = "date must be a real calendar date in YYYY-MM-DD form";
    } else {
      date = d;
    }
  } else if (create) {
    fields.date = "date is required";
  }

  // Category — validated against the EFFECTIVE direction. On update, a
  // direction change requires the category to be re-supplied.
  let category: string | undefined;
  if (b.category !== undefined) {
    const c = str(b.category) ?? "";
    const effectiveDirection = direction ?? undefined;
    if (effectiveDirection === undefined && !create) {
      // Updating category without a direction: we can't know the valid set
      // unless the caller also tells us the direction.
      fields.category = "to change category, also send the matching direction";
    } else if (
      effectiveDirection &&
      !categoriesFor(effectiveDirection).includes(c)
    ) {
      fields.category = `category must be one of: ${categoriesFor(effectiveDirection).join(", ")}`;
    } else if (effectiveDirection) {
      category = c;
    }
  } else if (create) {
    fields.category = "category is required";
  } else if (direction !== undefined) {
    // Direction changed on update but no category supplied — ambiguous.
    fields.category = "changing direction requires a matching category";
  }

  // Note.
  let note: string | undefined;
  if (b.note !== undefined) {
    const n = str(b.note) ?? "";
    if (n.length > MAX_NOTE) {
      fields.note = `note must be at most ${MAX_NOTE} characters`;
    } else {
      note = n;
    }
  }

  const receiptUrl = validateReceiptUrl(b.receiptUrl, fields);
  const extras = validateExtras(b, amountEgp, create, fields);

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  if (create) {
    // All required fields are guaranteed present here.
    const value: NewLedgerEntry = {
      date: date!,
      direction: direction!,
      category: category!,
      amountEgp: amountEgp!,
      method: method!,
      ...(note !== undefined ? { note } : {}),
      ...(receiptUrl !== undefined ? { receiptUrl } : {}),
      ...extras,
    };
    return { ok: true, value };
  }

  const patch: LedgerPatch = {
    ...(date !== undefined ? { date } : {}),
    ...(direction !== undefined ? { direction } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(amountEgp !== undefined ? { amountEgp } : {}),
    ...(method !== undefined ? { method } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(receiptUrl !== undefined ? { receiptUrl } : {}),
    ...extras,
  };
  return { ok: true, value: patch };
}
