import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-server";
import { ROLE_LABELS, can, TAB_ACCESS, type Role } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/users";
import { getCatalog, type Product } from "@/lib/catalog";
import { buildPnL, resolvePeriod, type PnL } from "@/lib/finance-report";
import { listCompanies, type CompanyDirectory } from "@/lib/companies";
import { listBatches, type Batch } from "@/lib/batches";
import { listApprovals, type Approval } from "@/lib/approvals";
import { listReceivables, type Receivable } from "@/lib/receivables";
import {
  buildSalesReport,
  buildInventoryReport,
  buildReceivablesReport,
  type SalesReport,
  type InventoryReport,
  type ReceivablesReport,
} from "@/lib/reports";
import {
  listQuotations,
  listPurchaseOrders,
  type Quotation,
  type PurchaseOrder,
} from "@/lib/sales";
import AdminTabs, { type AdminTab } from "./admin-tabs";
import SignOut from "./sign-out";
import OrderBookSection from "./order-book-section";
import ProductsSection from "./products-section";
import FinanceSection from "./finance-section";
import CustomersSection from "./customers-section";
import ReceivablesSection from "./receivables-section";
import ReceivingSection from "./receiving-section";
import ApprovalsSection from "./approvals-section";
import ReportsSection from "./reports-section";
import PurchaseOrdersSection from "./purchase-orders-section";
import QuotationsSection from "./quotations-section";
import OpenPOsSection from "./open-pos-section";
import UsersSection, { type AdminUser } from "./users-section";

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

  // --- Order Book (all purchase orders across their lifecycle) -----------------
  if (TAB_ACCESS.orders.includes(role)) {
    let allPOs: PurchaseOrder[] = [];
    try {
      allPOs = await listPurchaseOrders(false);
    } catch (e) {
      console.error("order book load:", e);
    }
    tabs.push({
      id: "orders",
      label: "Order Book",
      node: <OrderBookSection initial={allPOs} />,
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
    let receivables: Receivable[] = [];
    let openPOs: PurchaseOrder[] = [];
    try {
      receivables = await listReceivables(false);
      openPOs = await listPurchaseOrders(true);
    } catch (e) {
      console.error("receivables/PO load:", e);
    }
    tabs.push({
      id: "finance",
      label: "Finance",
      node: (
        <>
          <FinanceSection initialPnl={pnl} adminKey={clientKey} loadError={err} />
          <OpenPOsSection initialOpen={openPOs} />
          <ReceivablesSection initialReceivables={receivables} />
        </>
      ),
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

  // --- Purchase Orders (industrial PO generator) + Quotations & Outreach ------
  if (TAB_ACCESS.purchaseOrders.includes(role) || TAB_ACCESS.quotations.includes(role)) {
    let quotations: Quotation[] = [];
    let pos: PurchaseOrder[] = [];
    let productOptions: { slug: string; name: string }[] = [];
    let priceBySlug: Record<string, number> = {};
    try {
      const catalog = await getCatalog();
      productOptions = catalog.filter((p) => p.active).map((p) => ({ slug: p.slug, name: p.en.name }));
      priceBySlug = Object.fromEntries(catalog.map((p) => [p.slug, p.priceEgp]));
      quotations = await listQuotations();
      pos = await listPurchaseOrders(false);
    } catch (e) {
      console.error("sales load:", e);
    }
    if (TAB_ACCESS.purchaseOrders.includes(role)) {
      tabs.push({
        id: "purchaseOrders",
        label: "Purchase Orders",
        node: (
          <PurchaseOrdersSection
            products={productOptions}
            priceBySlug={priceBySlug}
            initial={pos}
          />
        ),
      });
    }
    if (TAB_ACCESS.quotations.includes(role)) {
      tabs.push({
        id: "quotations",
        label: "Quotations & Outreach",
        node: (
          <QuotationsSection
            products={productOptions}
            priceBySlug={priceBySlug}
            initialQuotations={quotations}
          />
        ),
      });
    }
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
          canReceive={can(role, "batches.receive")}
        />
      ),
    });
  }

  // --- Reports (role-appropriate + AI analysis) -------------------------------
  if (TAB_ACCESS.reports.includes(role)) {
    let sales: SalesReport | null = null;
    let inventory: InventoryReport | null = null;
    let receivables: ReceivablesReport | null = null;
    try {
      // Sales → owner/admin/sales; Inventory → owner/admin/inventory;
      // Receivables → owner/admin (finance).
      if (can(role, "orders.view")) sales = await buildSalesReport(30);
      if (can(role, "catalog.editStock") || role === "sales")
        inventory = await buildInventoryReport();
      if (can(role, "finance.view")) receivables = await buildReceivablesReport();
    } catch (e) {
      console.error("reports load:", e);
    }
    tabs.push({
      id: "reports",
      label: "Reports",
      node: (
        <ReportsSection
          sales={sales}
          inventory={inventory}
          receivables={receivables}
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
      </header>

      <AdminTabs tabs={tabs} />
    </main>
  );
}
