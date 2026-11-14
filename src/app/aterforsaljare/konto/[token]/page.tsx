import type { Metadata } from "next";
import Link from "next/link";
import { AccessForm } from "@/features/invite/access-form";
import styles from "@/features/invite/invite.module.css";
import { requireDb } from "@/lib/db/client";
import { databaseConfigured } from "@/lib/orders/repository";
import { findAccessLink } from "@/lib/reseller-auth/access-links";
import { getApplication } from "@/lib/reseller-auth/applications";

export const metadata: Metadata = { title: "Välj lösenord", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Vem länken gäller: företaget och e-postadressen som kontot loggar in med. */
async function linkTarget(token: string): Promise<{ kind: "activate" | "reset"; name: string; email: string } | null> {
  if (!databaseConfigured()) return null;
  const link = await findAccessLink(token);
  if (!link) return null;
  if (link.kind === "activate") {
    const application = link.applicationId ? await getApplication(link.applicationId) : null;
    return application && application.status === "approved" && !application.accountId
      ? { kind: "activate", name: application.company, email: application.email }
      : null;
  }
  const [account] = await requireDb()<{ name: string; email: string }[]>`
    select name, email from reseller_accounts where id = ${link.accountId}`;
  return account ? { kind: "reset", name: account.name, email: account.email } : null;
}

/** Länken från namnskylt.com: en godkänd återförsäljare väljer lösenord, eller ett konto får ett nytt. */
export default async function AccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await linkTarget(token);
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {target ? (
          <>
            <header>
              <p className={styles.eyebrow}>namnskylt.com</p>
              <h1 className={styles.title}>{target.kind === "activate" ? `Välkommen, ${target.name}` : "Välj nytt lösenord"}</h1>
              <p className={styles.lead}>
                {target.kind === "activate"
                  ? "Ansökan är godkänd. Välj ett lösenord, så är kontot klart och du kommer rakt in i panelen."
                  : `Lösenordet gäller kontot för ${target.name}.`}
              </p>
            </header>
            <AccessForm token={token} email={target.email} submitLabel={target.kind === "activate" ? "Skapa kontot" : "Spara lösenordet"} />
          </>
        ) : (
          <header>
            <p className={styles.eyebrow}>namnskylt.com</p>
            <h1 className={styles.title}>Länken fungerar inte längre</h1>
            <p className={styles.gone}>
              Den är redan använd eller har gått ut. Be namnskylt.com om en ny, eller <Link href="/aterforsaljare">logga in</Link>.
            </p>
          </header>
        )}
      </div>
    </main>
  );
}
