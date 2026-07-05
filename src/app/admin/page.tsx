import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-server";
import { ROLE_LABELS, can, TAB_ACCESS, type Role } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/users";
import { listOrders } from "@/lib/orders";
import { getCatalog, type Product } from "@/lib/catalog";
import { buildPnL, resolvePeriod, type PnL } from "@/lib/finance-report";
import { listCompanies, type CompanyDirectory } from "@/lib/companies";
import { listBatches, type Batch } from "@/lib/batches";
import { listApprovals, type Approval } from "@/lib/approvals";
import AdminTabs, { type AdminTab } from "./admin-tabs";
import SignOut from "./sign-out";
import OrdersSection from "./orders-section";
import ProductsSection from "./products-section";
import FinanceSection from "./finance-section";
import CustomersSection from "./customers-section";
import ReceivingSection from "./receiving-section";
import ApprovalsSection from "./approvals-section";
import UsersSection, { type AdminUser } from "./users-section";
import PlaceholderSection from "./placeholder-section";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Fayek Abrasives",
  robots: { index: false, follow: false },
};

const LOAD_ERR = (what: string) =>
  `Couldn't load ${what}. Refresh or try again shortly.`;

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  const role: Role = session.role;
  const clientKey = ""; // client components authenticate via the session cookie

  const tabs: AdminTab[] = [];

  // --- Orders -----------------------------------------------------------------
  if (TAB_ACCESS.orders.includes(role)) {
    let orders: Awaited<ReturnType<typeof listOrders>> = [];
    let err: string | null = null;
    try {
      orders = await listOrders({ limit: 100 });
    } catch (e) {
      console.error("orders load:", e);
      err = LOAD_ERR("orders");
    }
    tabs.push({
      id: "orders",
      label: "Orders",
      node: <OrdersSection orders={orders} adminKey={clientKey} loadError={err} />,
    });
  }

  // --- Products Inventory ------------------------------------------------------
  if (TAB_ACCESS.inventory.includes(role)) {
    let products: Product[] = [];
    let err: string | null = null;
    try {
      products = await getCatalog();
    } catch (e) {
      console.error("catalog load:", e);
      err = LOAD_ERR("the product catalog");
    }
    tabs.push({
      id: "inventory",
      label: "Products Inventory",
      node: (
        <ProductsSection
          initialProducts={products}
          adminKey={clientKey}
          loadError={err}
          canManage={can(role, "catalog.editPrice")}
          canEditStock={can(role, "catalog.editStock")}
        />
      ),
    });
  }

  // --- Finance ----------------------------------------------------------------
  if (TAB_ACCESS.finance.includes(role)) {
    let pnl: PnL | null = null;
    let err: string | null = null;
    try {
      const period = resolvePeriod({ period: "month" });
      if (!period.ok) throw new Error("bad period");
      pnl = await buildPnL(period.period);
    } catch (e) {
      console.error("finance load:", e);
      err = LOAD_ERR("the finance ledger");
    }
    tabs.push({
      id: "finance",
      label: "Finance",
      node: <FinanceSection initialPnl={pnl} adminKey={clientKey} loadError={err} />,
    });
  }

  // --- Customers (company accounts) -------------------------------------------
  if (TAB_ACCESS.customers.includes(role)) {
    let companies: CompanyDirectory[] = [];
    try {
      companies = await listCompanies();
    } catch (e) {
      console.error("customers load:", e);
    }
    tabs.push({
      id: "customers",
      label: "Customers",
      node: (
        <CustomersSection
          initialCompanies={companies}
          canAccount={can(role, "customers.account")}
        />
      ),
    });
  }

  // --- Receiving (factory batches) --------------------------------------------
  if (TAB_ACCESS.receiving.includes(role)) {
    let batches: Batch[] = [];
    let productOptions: { slug: string; name: string }[] = [];
    try {
      batches = await listBatches();
      const catalog = await getCatalog();
      productOptions = catalog
        .filter((p) => p.active)
        .map((p) => ({ slug: p.slug, name: p.en.name }));
    } catch (e) {
      console.error("receiving load:", e);
    }
    tabs.push({
      id: "receiving",
      label: "Receiving",
      node: (
        <ReceivingSection
          initialBatches={batches}
          products={productOptions}
          canCreate={can(role, "batches.create")}
        />
      ),
    });
  }

  // --- Reports (module lands in a later phase) --------------------------------
  if (TAB_ACCESS.reports.includes(role)) {
    tabs.push({
      id: "reports",
      label: "Reports",
      node: (
        <PlaceholderSection
          title="Reports"
          blurb="Sales, inventory and finance reports with AI analysis."
          bullets={[
            "Sales by day / product / customer, with trends",
            "Inventory levels, low-stock and dead-stock reports",
            "Finance: revenue, receivables ageing, P&L",
            "AI summary + recommendations on each report",
          ]}
        />
      ),
    });
  }

  // --- Approvals & Decisions (Owner/Admin) ------------------------------------
  if (TAB_ACCESS.approvals.includes(role)) {
    let approvals: Approval[] = [];
    try {
      approvals = await listApprovals("pending");
    } catch (e) {
      console.error("approvals load:", e);
    }
    const label =
      approvals.length > 0
        ? `Approvals & Decisions (${approvals.length})`
        : "Approvals & Decisions";
    tabs.push({
      id: "approvals",
      label,
      node: <ApprovalsSection initialApprovals={approvals} />,
    });
  }

  // --- Users ------------------------------------------------------------------
  if (TAB_ACCESS.users.includes(role)) {
    let users: AdminUser[] = [];
    try {
      users = (await listUsers()).map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        roleLabel: ROLE_LABELS[u.role],
        active: u.active,
        createdAt: u.createdAt,
      }));
    } catch (e) {
      console.error("users load:", e);
    }
    tabs.push({
      id: "users",
      label: "Users",
      node: (
        <UsersSection
          initialUsers={users}
          currentUserId={session.uid}
          currentRole={role}
        />
      ),
    });
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-serif text-2xl tracking-tight text-[#38492E]">
            Fayek Abrasives
          </div>
          <div className="flex items-center gap-3 text-sm text-[#5E6B4F]">
            <span>
              {session.name || session.username}
              <span className="ml-1 rounded-full bg-[#38492E]/10 px-2 py-0.5 text-xs text-[#38492E]">
                {ROLE_LABELS[role]}
              </span>
            </span>
            <SignOut label={`Signed in as ${session.username}`} />
          </div>
        </div>
        <h1 className="mt-2 font-serif text-4xl text-[#38492E]">Store admin</h1>
        <p className="mt-2 text-sm text-[#5E6B4F]">
          Times shown in Cairo time (Africa/Cairo).
        </p>
        {can(role, "pos.sell") && (
          <a
            href="/admin/pos"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#357F75] px-5 py-2.5 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90"
          >
            Open Store POS →
          </a>
        )}
      </header>

      <AdminTabs tabs={tabs} />
    </main>
  );
}
