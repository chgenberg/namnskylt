"use client";

import { useState, useTransition } from "react";
import { createBadgeDocument, lineUnitPrices, MATERIALS, type MaterialId } from "@/engine";
import { formatSek } from "@/features/orders/format";
import { MAX_PRICE_PERCENT, MIN_PRICE_PERCENT, shopUnitPrices, type ShopPriceList } from "@/lib/shops/price-list";
import {
  refreshShopOptionsAction,
  saveShopDomainAction,
  saveShopLookAction,
  saveShopPriceListAction,
  type ShopSaveResult,
} from "./shop-actions";
import styles from "./admin.module.css";

type Message = { ok: boolean; text: string } | null;

function useSave(okText: string) {
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ShopSaveResult>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: result.error });
    });
  };
  return { message, pending, run };
}

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <span className={message.ok ? styles.success : styles.error} role="status">
      {message.text}
    </span>
  );
}

/* ───────── Utseende: logga och färger ur skrapningen ───────── */

interface LookProps {
  slug: string;
  logo: string | null;
  primaryColor: string;
  accentColor: string;
  logoOptions: string[];
  colorOptions: string[];
}

export function ShopLookForm({ slug, logo, primaryColor, accentColor, logoOptions, colorOptions }: LookProps) {
  const current = logoOptions.findIndex((option) => option === logo);
  const [logoIndex, setLogoIndex] = useState<number | null>(current >= 0 ? current : null);
  const [primary, setPrimary] = useState(primaryColor);
  const [accent, setAccent] = useState(accentColor);
  const save = useSave("Utseendet är sparat");
  const refresh = useSave("Förslagen är hämtade på nytt");
  const swatches = [...new Set([primaryColor, accentColor, ...colorOptions].map((c) => c.toLowerCase()))];

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save.run(() => saveShopLookAction(slug, { logoIndex, primaryColor: primary, accentColor: accent }));
      }}
    >
      <div className={styles.formLabel}>Logga</div>
      {logoOptions.length === 0 ? (
        <p className={styles.muted}>Butiken byggdes innan förslagen sparades. Hämta om från hemsidan för att välja bland dem.</p>
      ) : (
        <div className={styles.logoPicks} role="radiogroup" aria-label="Logga">
          {logoOptions.map((option, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={logoIndex === i}
              className={styles.logoPick}
              onClick={() => setLogoIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL ur skrapningen */}
              <img src={option} alt={`Loggaförslag ${i + 1}`} />
            </button>
          ))}
        </div>
      )}

      <div className={styles.colorPicks}>
        {(
          [
            ["Huvudfärg — knappar och rubriker", primary, setPrimary],
            ["Accent", accent, setAccent],
          ] as const
        ).map(([label, value, set]) => (
          <div key={label} className={styles.colorPick}>
            <span className={styles.formLabel}>{label}</span>
            <div className={styles.swatchRow}>
              {swatches.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={styles.swatchButton}
                  style={{ background: color }}
                  aria-label={color}
                  aria-pressed={value.toLowerCase() === color}
                  onClick={() => set(color)}
                />
              ))}
              <label className={styles.swatchCustom} title="Egen färg">
                <input type="color" value={value} onChange={(e) => set(e.target.value)} aria-label={`${label}: egen färg`} />
              </label>
              <span className="mono">{value.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actionBar}>
        <button type="submit" className="btn btn--primary" disabled={save.pending}>
          {save.pending ? "Sparar…" : "Spara utseende"}
        </button>
        <button
          type="button"
          className={styles.ghostButton}
          disabled={refresh.pending}
          onClick={() => refresh.run(() => refreshShopOptionsAction(slug))}
        >
          {refresh.pending ? "Läser hemsidan…" : "Hämta om från hemsidan"}
        </button>
        <Status message={save.message ?? refresh.message} />
      </div>
    </form>
  );
}

/* ───────── Priser ───────── */

function parsePercent(text: string): number | null {
  const value = Math.round(Number(text.replace(",", ".").replace("+", "")));
  return text.trim() === "" || !Number.isFinite(value) ? null : Math.min(MAX_PRICE_PERCENT, Math.max(MIN_PRICE_PERCENT, value));
}

const EXAMPLES = MATERIALS.map((material) => ({
  material,
  badge: { ...createBadgeDocument(["Anna Lind", "Säljare"]), materialId: material.id, colorId: material.colors[0]?.id ?? "" },
}));

export function ShopPriceForm({ slug, priceList }: { slug: string; priceList: ShopPriceList | null }) {
  const [general, setGeneral] = useState(priceList?.percent ? String(priceList.percent) : "");
  const [perMaterial, setPerMaterial] = useState<Partial<Record<MaterialId, string>>>(() =>
    Object.fromEntries(Object.entries(priceList?.perMaterial ?? {}).map(([id, pct]) => [id, String(pct)])),
  );
  const save = useSave("Priserna är sparade — butiken visar dem direkt");
  const draft: ShopPriceList = {
    percent: parsePercent(general) ?? 0,
    perMaterial: Object.fromEntries(
      Object.entries(perMaterial).flatMap(([id, text]) => {
        const pct = parsePercent(text ?? "");
        return pct === null ? [] : [[id, pct]];
      }),
    ),
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save.run(() => saveShopPriceListAction(slug, draft));
      }}
    >
      <label className={`${styles.discountField} ${styles.fitContent}`}>
        <span className={styles.formLabel}>Påslag på riktpriset (minus = rabatt)</span>
        <span className={styles.priceInput}>
          <input inputMode="decimal" value={general} placeholder="0" onChange={(e) => setGeneral(e.target.value)} aria-label="Påslag i procent" />
          <span>%</span>
        </span>
      </label>
      <div className={styles.priceTable} role="table" aria-label="Pris per material">
        <div className={`${styles.priceHead} ${styles.purchaseGrid}`} role="row">
          <span role="columnheader">Material</span>
          <span role="columnheader">Eget påslag</span>
          <span role="columnheader" className={styles.num}>
            Riktpris
          </span>
          <span role="columnheader" className={styles.num}>
            I butiken
          </span>
        </div>
        {EXAMPLES.map(({ material, badge }) => (
          <div key={material.id} className={`${styles.priceRow} ${styles.purchaseGrid}`} role="row">
            <span role="cell" className={styles.rowTitle}>
              <strong>{material.name}</strong>
              <span className={styles.muted}>70×25 mm, två rader</span>
            </span>
            <span role="cell">
              <label className={styles.priceInput}>
                <span className="visually-hidden">Påslag för {material.name}</span>
                <input
                  inputMode="decimal"
                  value={perMaterial[material.id] ?? ""}
                  placeholder={String(draft.percent)}
                  onChange={(e) => setPerMaterial((all) => ({ ...all, [material.id]: e.target.value }))}
                />
                <span>%</span>
              </label>
            </span>
            <span role="cell" className={`${styles.num} mono`}>
              {formatSek(lineUnitPrices([badge])[0] ?? 0)}
            </span>
            <span role="cell" className={`${styles.num} mono`}>
              {formatSek(shopUnitPrices([badge], draft)[0] ?? 0)}
            </span>
          </div>
        ))}
      </div>
      <p className={styles.muted}>Tomt fält = det generella påslaget. Mängdrabatten räknas först, påslaget sedan. Ordern sparas med samma pris som kunden ser.</p>
      <div className={styles.actionBar}>
        <button type="submit" className="btn btn--primary" disabled={save.pending}>
          {save.pending ? "Sparar…" : "Spara priser"}
        </button>
        <Status message={save.message} />
      </div>
    </form>
  );
}

/* ───────── Adress och inbäddning ───────── */

export function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.copyField}>
      <span className={styles.formLabel}>{label}</span>
      <div className={styles.copyRow}>
        {multiline ? <pre className={styles.code}>{value}</pre> : <code className={styles.code}>{value}</code>}
        <button
          type="button"
          className={styles.ghostButton}
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Kopierad ✓" : "Kopiera"}
        </button>
      </div>
    </div>
  );
}

export function ShopDomainForm({ slug, domain }: { slug: string; domain: string | null }) {
  const [value, setValue] = useState(domain ?? "");
  const save = useSave("Adressen är sparad");
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save.run(() => saveShopDomainAction(slug, value));
      }}
    >
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Egen adress hos återförsäljaren</span>
        <input
          className={styles.input}
          value={value}
          placeholder="skylt.foretaget.se"
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
        />
      </label>
      <div className={styles.actionBar}>
        <button type="submit" className="btn btn--primary" disabled={save.pending}>
          {save.pending ? "Sparar…" : "Spara adress"}
        </button>
        <Status message={save.message} />
      </div>
    </form>
  );
}
