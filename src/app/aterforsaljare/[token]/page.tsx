import type { Metadata } from "next";
import { ClaimForm } from "@/features/invite/claim-form";
import styles from "@/features/invite/invite.module.css";
import { databaseConfigured } from "@/lib/orders/repository";
import { getInvite } from "@/lib/shops/editor-repository";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Ta över er butik", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Länken från namnskylt.com: återförsäljaren skapar sitt konto och tar över sin butik. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = databaseConfigured() ? await getInvite(token) : null;
  const shop = invite ? await getShop(invite.slug) : null;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {shop && invite ? (
          <>
            {shop.profile.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL ur butikens profil
              <img src={shop.profile.logo} alt={shop.profile.name} className={styles.logo} />
            )}
            <header>
              <p className={styles.eyebrow}>Er butik på namnskylt.com</p>
              <h1 className={styles.title}>Välkommen, {shop.profile.name}</h1>
              <p className={styles.lead}>
                Skapa ert konto så kan ni ändra texter, bilder och priser i butiken, se statistik och ta emot ordrarna.
              </p>
            </header>
            <ClaimForm token={invite.token} email={invite.email} />
          </>
        ) : (
          <header>
            <p className={styles.eyebrow}>Inbjudan</p>
            <h1 className={styles.title}>Länken fungerar inte längre</h1>
            <p className={styles.gone}>Den är redan använd eller har gått ut. Be namnskylt.com om en ny inbjudan.</p>
          </header>
        )}
      </div>
    </main>
  );
}
