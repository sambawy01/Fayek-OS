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
 */
export const ROLES = ["owner", "admin", "inventory", "sales"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  inventory: "Inventory",
  sales: "Sales / Cashier",
};

/**
 * Fine-grained capabilities. Each maps to the set of roles allowed. The UI
 * hides what a role can't do; the API re-checks server-side (never trust the
 * client). Add capabilities here as later phases land — this is the single
 * source of truth for "who can do what".
 */
export const PERMISSIONS = {
  // Catalog / inventory
  "catalog.view": ["owner", "admin", "inventory", "sales"],
  "catalog.editPrice": ["owner", "admin"], // financial value — NOT inventory
  "catalog.editStock": ["owner", "admin", "inventory"],
  "catalog.receiveBatch": ["owner", "admin", "inventory"],
  // Orders / POS
  "orders.view": ["owner", "admin", "sales"],
  "pos.sell": ["owner", "admin", "sales"],
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
  orders: ["owner", "admin", "sales"],
  inventory: ["owner", "admin", "inventory", "sales"], // sales sees read-only
  finance: ["owner", "admin"],
  // Customers (companies): sales gets the directory view; owner/admin get the
  // full account (notes, payment terms, edit).
  customers: ["owner", "admin", "sales"],
  reports: ["owner", "admin", "inventory", "sales"],
  approvals: ["owner", "admin"],
  users: ["owner", "admin"],
};
