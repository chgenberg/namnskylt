"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { BadgePreview } from "@/components/badge-preview";
import { getMaterial, isPartnerMade, priceBadge } from "@/engine";
import { encodeShareCode } from "@/lib/share/share-link";
import { INSPIRATION, type InspirationEntry } from "./catalog";
import styles from "./inspiration.module.css";

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

function Frame({ entry, onOpen }: { entry: InspirationEntry; onOpen: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onOpen} aria-haspopup="dialog">
      <span className={styles.frame} style={{ "--accent": entry.accent } as CSSProperties}>
        <span className={styles.mat}>
          <Image
            src={entry.photo}
            alt={`${entry.company}: ${entry.lead}`}
            width={entry.photoWidth}
            height={entry.photoHeight}
            className={styles.photo}
            sizes="(max-width: 720px) 100vw, 50vw"
            priority
          />
          <span className={styles.shine} aria-hidden="true" />
        </span>
        <span className={styles.caption}>
          <span className={styles.company}>{entry.company}</span>
          <span className={styles.captionLead}>{entry.title}</span>
        </span>
      </span>
    </button>
  );
}

function Dialog({ entry, onClose }: { entry: InspirationEntry; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const material = getMaterial(entry.doc.materialId);
  const price = priceBadge(entry.doc);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const openDesigner = async () => {
    setOpening(true);
    try {
      const { code } = await encodeShareCode(entry.doc);
      router.push(`/skapa?d=${code}`);
    } catch {
      setOpening(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="inspiration-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.hero} style={{ "--accent": entry.accent } as CSSProperties}>
          <Image
            src={entry.photo}
            alt=""
            fill
            className={styles.heroPhoto}
            sizes="(max-width: 860px) 100vw, 42vw"
          />
        </div>
        <div className={styles.detail}>
          <header className={styles.detailHeader}>
            <p className={styles.eyebrow}>
              {entry.company} · {entry.industry}
            </p>
            <h2 id="inspiration-title" className={styles.detailTitle}>
              {entry.title}
            </h2>
            <button type="button" className={styles.close} aria-label="Stäng" onClick={() => ref.current?.close()}>
              ×
            </button>
          </header>
          <p className={styles.lead}>{entry.lead}</p>
          <p className={styles.body}>{entry.body}</p>
          <BadgePreview doc={entry.doc} className={styles.badge} label={entry.lead} />
          <ul className={styles.highlights}>
            {entry.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {isPartnerMade(entry.doc.materialId) && (
            <p className={styles.note}>
              {material.name} tillverkas av vår partner — pris och leveranstid bekräftas via e-post.
            </p>
          )}
          <footer className={styles.footer}>
            <p className={styles.price}>
              från <strong>{sek.format(price.unitSek)}</strong>
            </p>
            <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()}>
              Stäng
            </button>
            <button type="button" className="btn btn--primary" disabled={opening} onClick={() => void openDesigner()}>
              {opening ? "Öppnar…" : "Gör en liknande"}
            </button>
          </footer>
        </div>
      </div>
    </dialog>
  );
}

export function InspirationGallery() {
  const [open, setOpen] = useState<InspirationEntry | null>(null);

  return (
    <>
      <div className={styles.grid}>
        {INSPIRATION.map((entry) => (
          <Frame key={entry.slug} entry={entry} onOpen={() => setOpen(entry)} />
        ))}
      </div>
      {open && <Dialog entry={open} onClose={() => setOpen(null)} />}
    </>
  );
}
