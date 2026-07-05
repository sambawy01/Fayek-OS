/**
 * Role model + permission map for Fayek Abrasives. Edge-safe (no Node/DB
 * imports) so both the middleware and server code can use it.
 *
 * Roles (each user has exactly one):
 * - owner     — full access; final approver on escalations.
 * - admin     — day-to-day management; first-line approver.
 * - inventory — receives/counts stock, approves batch deliveries; NO price or
 *               financial value edits.
 * - sales     — POS sales, orders, and a lightweight customer directory (pick /
 *               add a customer mid-sale); NO cost, finance, or private notes.
 * - factory   — the factory side: declares/dispatches batches to the warehouse.
 *               Does NOT receive/count (that's inventory) and has no price,
 *               finance, or customer access.
 */
export const ROLES = ["owner", "admin", "inventory", "sales", "factory"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  inventory: "Inventory",
  sales: "Sales / Cashier",
  factory: "Factory",
};

/**
 * Fine-grained capabilities. Each maps to the set of roles allowed. The UI
 * hides what a role can't do; the API re-checks server-side (never trust the
 * client). Add capabilities here as later phases land — this is the single
 * source of truth for "who can do what".
 */
export const PERMISSIONS = {
  // Catalog / inventory
  "catalog.view": ["owner", "admin", "inventory", "sales", "factory"],
  "catalog.editPrice": ["owner", "admin"], // financial value — NOT inventory
  "catalog.editStock": ["owner", "admin", "inventory"],
  "catalog.receiveBatch": ["owner", "admin", "inventory"],
  // Factory batches / receiving
  "batches.view": ["owner", "admin", "inventory", "factory"],
  "batches.create": ["owner", "admin", "factory"], // declare a factory dispatch
  "batches.receive": ["owner", "admin", "inventory"], // count & receive — NOT factory
  // Order book (purchase orders across their lifecycle)
  "orders.view": ["owner", "admin", "sales"],
  // Sales: quotations + purchase orders + outreach
  "sales.quote": ["owner", "admin", "sales"],
  "sales.po.create": ["owner", "admin", "sales"],
  "sales.po.process": ["owner", "admin"], // invoice / fulfil open POs
  "outreach.use": ["owner", "admin", "sales"],
  // Prospecting: AI-discovered leads + approval
  "leads.manage": ["owner", "admin", "sales"], // view / approve / reject
  "leads.run": ["owner", "admin"], // trigger discovery (web-search + AI cost)
  // Customers
  "customers.directory": ["owner", "admin", "sales"], // search/select + create
  "customers.account": ["owner", "admin"], // finance history, credit, notes
  // Finance
  "finance.view": ["owner", "admin"],
  // Approvals / escalations
  "approvals.resolve": ["owner", "admin"],
  // Reports
  "reports.view": ["owner", "admin", "inventory", "sales"],
  // User administration
  "users.manage": ["owner", "admin"],
} as const;

export type Capability = keyof typeof PERMISSIONS;

/** True when `role` is allowed the capability. */
export function can(role: Role | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return (PERMISSIONS[cap] as readonly Role[]).includes(role);
}

/** The tabs each role may open in /admin (drives nav + server-side gating). */
export const TAB_ACCESS: Record<string, Role[]> = {
  orders: ["owner", "admin", "sales"], // order book — PO lifecycle
  purchaseOrders: ["owner", "admin", "sales"], // industrial PO generator
  quotations: ["owner", "admin", "sales"], // quotations + outreach
  prospecting: ["owner", "admin", "sales"], // AI-discovered leads + approval
  inventory: ["owner", "admin", "inventory", "sales"], // sales sees read-only
  finance: ["owner", "admin"],
  // Customers (companies): sales gets the directory view; owner/admin get the
  // full account (notes, payment terms, edit).
  customers: ["owner", "admin", "sales"],
  receiving: ["owner", "admin", "inventory", "factory"],
  reports: ["owner", "admin", "inventory", "sales"],
  approvals: ["owner", "admin"],
  users: ["owner", "admin"],
};
