import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-server";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — Fayek Abrasives",
  robots: { index: false, follow: false },
};

function safeNext(raw: string | string[] | undefined): string {
  const v = typeof raw === "string" ? raw : "";
  // Only allow same-origin absolute paths (no protocol-relative "//host").
  return v.startsWith("/") && !v.startsWith("//") ? v : "/admin";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next);
  if (await getSession()) redirect(dest);

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <div className="font-serif text-3xl tracking-tight text-[#0E2A47]">
          Fayek Abrasives
        </div>
        <p className="mt-1 text-sm text-[#5B7186]">Operations back-office</p>
      </div>
      <div className="rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-6 py-7 shadow-sm">
        <h1 className="mb-5 font-serif text-xl text-[#0E2A47]">Sign in</h1>
        <LoginForm next={dest} />
      </div>
    </main>
  );
}
