import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/admin/login-form";
import { Notice } from "@/features/admin/notice";
import { passwordResetAvailable } from "@/lib/reseller-auth/forgot";
import { currentTenant, resellerPass } from "@/lib/reseller-auth/session";

export const metadata: Metadata = { title: "Logga in som återförsäljare", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Återförsäljarens inlogg. namnskylt.coms eget ligger på /admin. */
export default async function ResellerLoginPage() {
  if (!resellerPass.configured()) {
    return (
      <main>
        <Notice title="Inloggningen är inte påslagen">Hör av dig till namnskylt.com.</Notice>
      </main>
    );
  }
  if (await currentTenant()) redirect("/admin");
  return (
    <main>
      <LoginForm kind="reseller" canReset={passwordResetAvailable()} />
    </main>
  );
}
