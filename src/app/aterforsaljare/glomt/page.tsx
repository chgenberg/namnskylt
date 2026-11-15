import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/features/invite/forgot-form";
import styles from "@/features/invite/invite.module.css";
import { passwordResetAvailable } from "@/lib/reseller-auth/forgot";

export const metadata: Metadata = { title: "Glömt lösenordet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Den som har glömt sitt lösenord får en länk på mejlen. Utan påslagna mejl hänvisar sidan till namnskylt.com. */
export default function ForgotPasswordPage() {
  const available = passwordResetAvailable();
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header>
          <p className={styles.eyebrow}>Återförsäljare</p>
          <h1 className={styles.title}>Glömt lösenordet</h1>
          <p className={styles.lead}>
            {available
              ? "Skriv adressen du loggar in med, så mejlar vi en länk där du väljer ett nytt lösenord."
              : "Hör av dig till namnskylt.com, så får du en länk där du väljer ett nytt lösenord."}
          </p>
        </header>
        {available && <ForgotForm />}
        <p className={styles.foot}>
          <Link href="/aterforsaljare">Till inloggningen</Link>
        </p>
      </div>
    </main>
  );
}
