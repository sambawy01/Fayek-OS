import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-server";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { listOrders, type StoredOrder } from "@/lib/orders";
import { getCatalog, type Product } from "@/lib/catalog";
import { buildPnL, resolvePeriod, type PnL } from "@/lib/finance-report";
import {
  getClientsOverview,
  toClientSummary,
  type ClientSummary,
  type UnlinkedOverlay,
} from "@/lib/crm";
import AdminTabs from "./admin-tabs";
import SignOut from "./sign-out";
import OrdersSection from "./orders-section";
import ProductsSection from "./products-section";
import FinanceSection from "./finance-section";
import ClientsSection from "./clients-section";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Fayek Abrasives",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The proxy already requires a valid session for /admin; this re-check gets
  // the signed-in user (and guards against a matcher misconfig).
  void searchParams;
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");

  // Client components authenticate via the session cookie (auto-sent on every
  // same-origin fetch), so no key needs to be threaded down.
  const clientKey = "";

  let orders: StoredOrder[] = [];
  let ordersError: string | null = null;
  let products: Product[] = [];
  let productsError: string | null = null;
  let financePnl: PnL | null = null;
  let financeError: string | null = null;
  let clientSummaries: ClientSummary[] = [];
  let unlinkedOverlays: UnlinkedOverlay[] = [];
  let clientsError: string | null = null;
  const monthPeriod = resolvePeriod({ period: "month" });
  // Shop orders, the product catalog, the finance P&L and the client directory
  // load independently — one backend being down must not blank the others.
  const [ordersResult, catalogResult, financeResult, clientsResult] =
    await Promise.allSettled([
      listOrders({ limit: 100 }),
      getCatalog(),
      monthPeriod.ok ? buildPnL(monthPeriod.period) : Promise.reject(new Error("bad period")),
      getClientsOverview(),
    ]);
  if (ordersResult.status === "fulfilled") {
    orders = ordersResult.value;
  } else {
    console.error("Admin orders load error:", ordersResult.reason);
    ordersError = "Couldn't load shop orders. Pull down to refresh or try again shortly.";
  }
  if (catalogResult.status === "fulfilled") {
    products = catalogResult.value;
  } else {
    console.error("Admin catalog load error:", catalogResult.reason);
    productsError = "Couldn't load the product catalog. Pull down to refresh or try again shortly.";
  }
  if (financeResult.status === "fulfilled") {
    financePnl = financeResult.value;
  } else {
    console.error("Admin finance load error:", financeResult.reason);
    financeError = "Couldn't load the finance ledger. Pull down to refresh or try again shortly.";
  }
  if (clientsResult.status === "fulfilled") {
    clientSummaries = clientsResult.value.profiles.map(toClientSummary);
    unlinkedOverlays = clientsResult.value.unlinked;
  } else {
    console.error("Admin clients load error:", clientsResult.reason);
    clientsError = "Couldn't load clients. Pull down to refresh or try again shortly.";
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-serif text-2xl tracking-tight text-[#38492E]">Fayek Abrasives</div>
          <div className="flex items-center gap-3 text-sm text-[#5E6B4F]">
            <span>
              {session.name || session.username}
              <span className="ml-1 rounded-full bg-[#38492E]/10 px-2 py-0.5 text-xs text-[#38492E]">
                {ROLE_LABELS[session.role]}
              </span>
            </span>
            <SignOut label={`Signed in as ${session.username}`} />
          </div>
        </div>
        <h1 className="mt-2 font-serif text-4xl text-[#38492E]">Store admin</h1>
        <p className="mt-2 text-sm text-[#5E6B4F]">
          Times shown in Cairo time (Africa/Cairo).
        </p>
        <a
          href="/admin/pos"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#357F75] px-5 py-2.5 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90"
        >
          Open Store POS →
        </a>
      </header>

      <AdminTabs
        orders={
          <OrdersSection
            orders={orders}
            adminKey={clientKey}
            loadError={ordersError}
          />
        }
        products={
          <ProductsSection
            initialProducts={products}
            adminKey={clientKey}
            loadError={productsError}
          />
        }
        finance={
          <FinanceSection
            initialPnl={financePnl}
            adminKey={clientKey}
            loadError={financeError}
          />
        }
        clients={
          <ClientsSection
            initialClients={clientSummaries}
            initialUnlinked={unlinkedOverlays}
            adminKey={clientKey}
            loadError={clientsError}
          />
        }
      />
    </main>
  );
}
