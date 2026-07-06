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
  listProcessablePurchaseOrders,
  listDispatchQueue,
  getPurchaseOrder,
  type Quotation,
  type PurchaseOrder,
  type PurchaseOrderDetail,
} from "@/lib/sales";
import ClientDispatchSection from "./client-dispatch-section";
import AdminTabs, { type AdminTab } from "./admin-tabs";
import AutoRefresh from "./auto-refresh";
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
import ProspectingSection from "./prospecting-section";
import OpenPOsSection from "./open-pos-section";
import { listLeads, countLeadsByStatus, type Lead } from "@/lib/leads";
import { listProductionOrders, type ProductionOrder } from "@/lib/production";
import { availability } from "@/lib/reservations";
import ProductionSection from "./production-section";
import FactoryWarehouseSection from "./factory-warehouse-section";
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
    let reservedBySlug: Record<string, number> = {};
    let err: string | null = null;
    try {
      products = await getCatalog();
      const avail = await availability(products.map((p) => p.slug));
      reservedBySlug = Object.fromEntries(
        [...avail.values()].filter((a) => a.reserved > 0).map((a) => [a.slug, a.reserved])
      );
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
          reservedBySlug={reservedBySlug}
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
      openPOs = await listProcessablePurchaseOrders();
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

  // --- Prospecting (AI-discovered leads + approval) ---------------------------
  if (TAB_ACCESS.prospecting.includes(role)) {
    let leads: Lead[] = [];
    let reserveCount = 0;
    try {
      [leads, reserveCount] = await Promise.all([listLeads(), countLeadsByStatus("reserve")]);
    } catch (e) {
      console.error("leads load:", e);
    }
    const pendingCount = leads.filter((l) => l.status === "pending").length;
    tabs.push({
      id: "prospecting",
      label: pendingCount > 0 ? `Prospecting (${pendingCount})` : "Prospecting",
      node: (
        <ProspectingSection
          initialLeads={leads}
          reserveCount={reserveCount}
          canRun={can(role, "leads.run")}
        />
      ),
    });
  }

  // --- Factory Dispatch + Inventory Receiving (separate tabs, shared data) -----
  if (TAB_ACCESS.dispatch.includes(role) || TAB_ACCESS.receiving.includes(role)) {
    let batches: Batch[] = [];
    let productOptions: { slug: string; name: string }[] = [];
    try {
      batches = await listBatches();
      const catalog = await getCatalog();
      productOptions = catalog
        .filter((p) => p.active)
        .map((p) => ({ slug: p.slug, name: p.en.name }));
    } catch (e) {
      console.error("batches load:", e);
    }
    // Factory Dispatch: declare/dispatch batches + Dispatch Order records.
    if (TAB_ACCESS.dispatch.includes(role)) {
      tabs.push({
        id: "dispatch",
        label: "Factory Dispatch",
        node: (
          <ReceivingSection
            initialBatches={batches}
            products={productOptions}
            canCreate={can(role, "batches.create")}
            canReceive={false}
            mode="dispatch"
          />
        ),
      });
    }
    // Inventory Receiving: confirm & count; dispatched batches "pop up" as a badge.
    if (TAB_ACCESS.receiving.includes(role)) {
      const awaitingReceipt = batches.filter((b) => b.status === "dispatched").length;
      tabs.push({
        id: "receiving",
        label: awaitingReceipt > 0 ? `Receiving (${awaitingReceipt})` : "Receiving",
        node: (
          <ReceivingSection
            initialBatches={batches}
            products={productOptions}
            canCreate={false}
            canReceive={can(role, "batches.receive")}
            mode="receive"
          />
        ),
      });
    }
  }

  // --- Production (reorder automation + factory production orders) -------------
  if (can(role, "production.view")) {
    let prodOrders: ProductionOrder[] = [];
    let prodProducts: { slug: string; name: string }[] = [];
    try {
      prodOrders = await listProductionOrders();
      const catalog = await getCatalog();
      prodProducts = catalog.filter((p) => p.active).map((p) => ({ slug: p.slug, name: p.en.name }));
    } catch (e) {
      console.error("production load:", e);
    }
    const pendingProd = prodOrders.filter((o) => o.status === "pending_approval").length;
    // Owner/Admin: author production orders (with AI suggestions) + approve
    // auto-raised ones. This management surface lives in the Owner/Admin group.
    if (can(role, "production.manage")) {
      tabs.push({
        id: "productionOrders",
        label: pendingProd > 0 ? `Production Orders (${pendingProd})` : "Production Orders",
        node: (
          <ProductionSection
            initialOrders={prodOrders}
            products={prodProducts}
            canManage
            mode="manage"
          />
        ),
      });
    }
    // Factory queue: approved/in-production only — start + dispatch, no create/approve.
    tabs.push({
      id: "production",
      label: "Production",
      node: (
        <ProductionSection
          initialOrders={prodOrders}
          products={prodProducts}
          canManage={false}
          mode="queue"
        />
      ),
    });
    tabs.push({
      id: "factoryWarehouse",
      label: "Factory Warehouse",
      node: <FactoryWarehouseSection initialOrders={prodOrders} />,
    });
  }

  // --- Client Dispatch (POs Finance released for warehouse dispatch) ----------
  if (TAB_ACCESS.clientDispatch.includes(role)) {
    let queue: PurchaseOrderDetail[] = [];
    try {
      const basic = await listDispatchQueue();
      queue = (await Promise.all(basic.map((p) => getPurchaseOrder(p.id)))).filter(
        (p): p is PurchaseOrderDetail => p !== null
      );
    } catch (e) {
      console.error("dispatch queue load:", e);
    }
    tabs.push({
      id: "clientDispatch",
      label: queue.length > 0 ? `Client Dispatch (${queue.length})` : "Client Dispatch",
      node: <ClientDispatchSection initial={queue} canConfirm={can(role, "sales.po.dispatch")} />,
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-7">
        {/* Instrument-panel top bar: brand mark + operator identity */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#0E2A47]/10 bg-white px-5 py-3.5 shadow-sm shadow-[#0E2A47]/5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.fayekabrasives.com/assets/images/logo.jpg"
              alt="Fayek Abrasives"
              className="h-11 w-11 rounded-lg object-contain ring-1 ring-[#0E2A47]/10"
            />
            <div className="leading-tight">
              <div className="font-serif text-lg font-semibold tracking-wide text-[#0E2A47]">
                FAYEK ABRASIVES
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1668C7]">
                Operations OS
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#5B7186]">
            <span className="flex items-center gap-2">
              <span className="hidden sm:inline">{session.name || session.username}</span>
              <span className="rounded-md bg-[#E4EEFA] px-2 py-0.5 text-xs font-semibold text-[#1668C7]">
                {ROLE_LABELS[role]}
              </span>
            </span>
            <SignOut label={`Signed in as ${session.username}`} />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-6 w-1.5 rounded-full bg-[#1668C7]" />
          <div>
            <h1 className="font-serif text-3xl text-[#0E2A47]">Operations Console</h1>
            <p className="mt-0.5 text-sm text-[#5B7186]">
              Cairo time (Africa/Cairo) · live operations, inventory &amp; finance
            </p>
          </div>
        </div>
      </header>

      <AutoRefresh />
      <AdminTabs tabs={tabs} />
    </main>
  );
}
