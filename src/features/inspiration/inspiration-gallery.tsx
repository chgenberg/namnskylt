import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { getMaterial, isPartnerMade } from "@/engine";
import { DETAIL_IMAGE, INSPIRATION } from "@/lib/inspiration/catalog";
import styles from "./inspiration.module.css";

interface InspirationGalleryProps {
  /** Länken som öppnar exemplets skylt i skyltmotorn, per exempel. */
  links: Readonly<Record<string, string>>;
}

/**
 * Exemplen under varandra, med närbilder på valen till höger om varje bild (besked från Pär via
 * ägaren 2026-11-20: i stället för 2 × 2 bilder, "4 bilder under varandra" och "närbilder på de val
 * vi gjort", "tydligt och enkelt överskådat"). Förut låg allt bakom ett klick, i en dialog.
 * Närbilderna visar ytan, formen och fästet, och är tagna ur skyltmotorns 3D-vy. Under dem står
 * märkningsmetoden, som skiljer plastexemplen åt (gravyr, eller graverat namn med printad logga).
 */
export function InspirationGallery({ links }: InspirationGalleryProps) {
  return (
    <div className={styles.list}>
      {INSPIRATION.map((entry, index) => (
        <article key={entry.slug} className={styles.row} aria-labelledby={`inspiration-${entry.slug}`}>
          <div className={styles.frame} style={{ "--accent": entry.accent } as CSSProperties}>
            <Image
              src={entry.photo}
              alt={`${entry.company}: ${entry.lead}`}
              width={entry.photoWidth}
              height={entry.photoHeight}
              className={styles.photo}
              sizes="(max-width: 860px) 100vw, 320px"
              priority={index === 0}
            />
          </div>
          <div className={styles.text}>
            <p className="eyebrow">
              {entry.company} · {entry.industry}
            </p>
            <h2 id={`inspiration-${entry.slug}`} className={styles.rowTitle}>
              {entry.title}
            </h2>
            <p className={styles.lead}>{entry.lead}</p>
            <ul className={styles.details}>
              {entry.details.map((detail) => (
                <li key={detail.kind} className={styles.detail}>
                  <Image
                    src={detail.image}
                    alt={detail.alt}
                    width={DETAIL_IMAGE.width}
                    height={DETAIL_IMAGE.height}
                    className={styles.detailImage}
                    sizes="(max-width: 860px) 33vw, 260px"
                  />
                  <span className={styles.detailLabel}>{detail.label}</span>
                  <strong className={styles.detailValue}>{detail.value}</strong>
                </li>
              ))}
            </ul>
            <p className={styles.method}>
              <span className={styles.detailLabel}>Märkning</span>
              <strong className={styles.detailValue}>{entry.marking}</strong>
            </p>
            {isPartnerMade(entry.doc.materialId) && (
              <p className={styles.note}>
                {getMaterial(entry.doc.materialId).name} tillverkas av vår partner — pris och leveranstid bekräftas via e-post.
              </p>
            )}
            <div>
              <Link href={links[entry.slug] ?? "/skapa"} className="btn btn--primary">
                Gör en liknande
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
