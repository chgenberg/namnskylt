import type { Metadata } from "next";
import { PasswordLinkPage } from "@/features/customer-account/password-link-page";

export const metadata: Metadata = { title: "Välj nytt lösenord", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

/** Länken där en kund på namnskylt.com väljer nytt lösenord. Koden i länken är behörigheten. */
export default async function AccountPasswordRoute({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main>
      <PasswordLinkPage shop={null} sellerName="namnskylt.com" token={(await params).token} />
    </main>
  );
}
