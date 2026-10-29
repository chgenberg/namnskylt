import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { SenderFonts, SenderMark } from "@/components/sender-mark";
import { engravedRows, getColor, getMaterial, getMounting } from "@/engine";
import { ProofForm } from "@/features/proof/proof-form";
import styles from "@/features/proof/proof.module.css";
import { badgeCount } from "@/lib/orders/model";
import { databaseConfigured, getProof } from "@/lib/orders/repository";
import { resolveSender } from "@/lib/shops/sender";

export const metadata: Metadata = {
  title: "Korrektur",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

interface ProofPageProps {
  params: Promise<{ token: string }>;
}

export default async function ProofPage({ params }: ProofPageProps) {
  if (!databaseConfigured()) notFound();
  const { token } = await params;
  const found = await getProof(token);
  if (!found) notFound();
  const { proof, order } = found;
  const first = order.badges[0];
  const sender = await resolveSender({ resellerId: order.resellerId, shopSlug: order.shopSlug });

  return (
    <main className={styles.page} style={sender.themeVars as CSSProperties} data-branded={sender.ours ? undefined : ""}>
      <SenderFonts sender={sender} />
      <div className={styles.inner}>
        <SenderMark sender={sender} className={styles.logo} nameClassName={styles.brandName} />
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            Korrektur · <span className="mono">{order.orderNo}</span>
          </p>
          <h1 className={styles.title}>Stämmer skyltarna, {order.customer.name.split(" ")[0]}?</h1>
          <p className={styles.lead}>
            Kontrollera stavning, titlar och logga. Godkänner du går de direkt till gravyren — det går inte att ändra
            efteråt.
          </p>
        </header>

        <section className={styles.card}>
          {first && (
            <div className={styles.facts}>
              <span>
                <strong>{getMaterial(first.materialId).name}</strong> · {getColor(first.materialId, first.colorId).name}
              </span>
              <span>
                {first.size.widthMm} × {first.size.heightMm} mm
              </span>
              <span>Fäste: {getMounting(first.mounting).name}</span>
              <span>
                {order.badges.length} namn · {badgeCount(order)} skyltar
              </span>
            </div>
          )}
          <div className={styles.badges}>
            {order.badges.map((badge, i) => (
              <figure key={i} className={styles.badge}>
                <BadgePreview doc={badge} label={`Skylt: ${engravedRows(badge).map((r) => r.text).join(", ")}`} />
                <figcaption className={styles.badgeMeta}>{badge.quantity} st</figcaption>
              </figure>
            ))}
          </div>
          <ProofForm token={proof.token} decided={proof.status === "pending" ? null : proof.status} />
        </section>
        <p className={styles.foot}>
          {sender.ours ? "Graverat i Sverige av Skylt & Gravyrteknik · namnskylt.com" : `${sender.name} · Graverat i Sverige`}
        </p>
      </div>
    </main>
  );
}
