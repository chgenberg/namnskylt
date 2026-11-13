"use client";

import { useState, useTransition } from "react";
import {
  MAX_MARGIN_PERCENT,
  MAX_PRICE_SEK,
  OFFERED_MOUNTINGS,
  endPriceSek,
  endPriceTable,
  priceItems,
  priceModelSchema,
  provisionSplit,
  resellerPriceTable,
  tierRangeLabel,
  type MountingId,
  type PriceItem,
  type PriceModel,
  type PriceOptions,
  type SignClass,
} from "@/engine";
import { formatSek } from "@/lib/format";
import { marginOf } from "@/lib/orders/purchase";
import { savePriceModelAction } from "./actions";
import styles from "./price-model.module.css";

const SIGN_ROWS: readonly { id: SignClass; name: string; note: string }[] = [
  { id: "premium", name: "Premium", note: "Metallskyltarna" },
  { id: "standard", name: "Standard", note: "Printad eller graverad plast — säljs inte än" },
];

const OPTION_ROWS: readonly { id: keyof PriceOptions; name: string; note: string }[] = [
  { id: "extraEngraving", name: "Extra gravyr eller print", note: "Loggan på skylten" },
  { id: "pin", name: "Nål", note: "Fäste" },
  { id: "clip", name: "Militärklämma", note: "Fäste, heter Klämma på sajten" },
  { id: "magnet", name: "Magnet", note: "Fäste" },
  { id: "customShape", name: "Egen design, max 12 × 12 cm", note: "Plast i egen form" },
];

interface NumberFieldProps {
  label: string;
  value: number;
  unit: string;
  max: number;
  /** Kronor är heltal; procent får ha decimaler. */
  decimals?: boolean;
  onChange: (value: number) => void;
}

function NumberField({ label, value, unit, max, decimals = false, onChange }: NumberFieldProps) {
  return (
    <label className={styles.field}>
      <span className="visually-hidden">{label}</span>
      <input
        type="number"
        inputMode={decimals ? "decimal" : "numeric"}
        min={0}
        max={max}
        step={decimals ? 0.5 : 1}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          const clamped = Number.isFinite(next) ? Math.min(max, Math.max(0, next)) : 0;
          onChange(decimals ? clamped : Math.round(clamped));
        }}
      />
      <span>{unit}</span>
    </label>
  );
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

interface PriceModelEditorProps {
  model: PriceModel;
}

/**
 * Prismodellen som i kalkylbladet: återförsäljarens priser per trappsteg,
 * tillval, provision och slutkundens marginal. Kalkylen längst ned räknar på
 * utkastet direkt; först när det sparas gäller siffrorna på sajten.
 */
export function PriceModelEditor({ model }: PriceModelEditorProps) {
  const [saved, setSaved] = useState(model);
  const [draft, setDraft] = useState(model);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [signClass, setSignClass] = useState<SignClass>("premium");
  const [quantity, setQuantity] = useState(25);
  const [mounting, setMounting] = useState<MountingId>("pin");
  const [logo, setLogo] = useState(false);
  const [customShape, setCustomShape] = useState(false);

  const parsed = priceModelSchema.safeParse(draft);
  const problem = parsed.success ? null : (parsed.error.issues[0]?.message ?? "Ogiltiga siffror");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const items: PriceItem[] = [{ signClass, mounting, extraEngraving: logo, customShape, quantity: Math.max(1, quantity) }];
  const purchase = resellerPriceTable(draft);
  const reseller = priceItems(items, purchase);
  const end = priceItems(items, endPriceTable(draft));
  const split = provisionSplit(draft, reseller.totalSek, reseller.quantity);
  const margin = marginOf(end.totalSek, reseller.totalSek);
  const perSign = (sek: number) => `${formatSek(Math.round(sek / reseller.quantity))} / st`;

  const save = () => {
    if (!parsed.success) return;
    setMessage(null);
    startTransition(async () => {
      const result = await savePriceModelAction(parsed.data);
      if (result.ok) setSaved(parsed.data);
      setMessage(
        result.ok
          ? { ok: true, text: "Sparat. Siffrorna gäller nu på sajten och för nya ordrar och offerter." }
          : { ok: false, text: result.error },
      );
    });
  };

  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="price-model-signs">
        <h2 id="price-model-signs" className={styles.cardTitle}>
          Typ av skylt
        </h2>
        <p className={styles.muted}>
          Det återförsäljaren betalar per skylt. Provisionen är er andel av beloppet, resten går till Skylt &amp; Gravyrteknik.
        </p>
        <div className={styles.table}>
          <span className={styles.rowLabel}>Antal i ordern</span>
          {draft.tiers.map((tier, i) => (
            <span key={i} className={styles.columnHead}>
              {tierRangeLabel(i, purchase)}
              {i > 0 && (
                <NumberField
                  label={`Trappsteg ${i + 1} gäller när ordern har fler skyltar än`}
                  value={tier.moreThan}
                  unit="st, mer än"
                  max={1_000_000}
                  onChange={(moreThan) => setDraft({ ...draft, tiers: replaceAt(draft.tiers, i, { ...tier, moreThan }) })}
                />
              )}
            </span>
          ))}

          {SIGN_ROWS.map((row) => (
            <SignRows key={row.id} row={row} draft={draft} onChange={setDraft} />
          ))}

          <span className={styles.divider} />
          <span className={styles.rowLabel}>
            Provision
            <small>Er andel av det återförsäljaren betalar</small>
          </span>
          {draft.tiers.map((tier, i) => (
            <NumberField
              key={i}
              label={`Provision, ${tierRangeLabel(i, purchase)}`}
              value={tier.provisionPercent}
              unit="%"
              max={MAX_MARGIN_PERCENT}
              decimals
              onChange={(provisionPercent) => setDraft({ ...draft, tiers: replaceAt(draft.tiers, i, { ...tier, provisionPercent }) })}
            />
          ))}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-options">
        <h2 id="price-model-options" className={styles.cardTitle}>
          Tillval
        </h2>
        <p className={styles.muted}>Återförsäljarens pris per skylt, samma på alla trappsteg.</p>
        <div className={styles.optionGrid}>
          {OPTION_ROWS.map((row) => (
            <div key={row.id} className={styles.option}>
              <span>{row.name}</span>
              <NumberField
                label={row.name}
                value={draft.options[row.id]}
                unit="kr"
                max={MAX_PRICE_SEK}
                onChange={(value) => setDraft({ ...draft, options: { ...draft.options, [row.id]: value } })}
              />
              <small>
                {row.note} · slutkund {formatSek(endPriceSek(draft.options[row.id], draft))}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-order">
        <h2 id="price-model-order" className={styles.cardTitle}>
          Per order
        </h2>
        <div className={styles.optionGrid}>
          <div className={styles.option}>
            <span>Minidebitering</span>
            <NumberField label="Minidebitering" value={draft.minOrderSek} unit="kr" max={MAX_PRICE_SEK} onChange={(minOrderSek) => setDraft({ ...draft, minOrderSek })} />
            <small>Minsta belopp återförsäljaren betalar för en order</small>
          </div>
          <div className={styles.option}>
            <span>Slutkundens marginal</span>
            <NumberField
              label="Slutkundens marginal"
              value={draft.endMarginPercent}
              unit="%"
              max={MAX_MARGIN_PERCENT}
              decimals
              onChange={(endMarginPercent) => setDraft({ ...draft, endMarginPercent })}
            />
            <small>Slutkundens pris = återförsäljarens pris / (1 − marginalen)</small>
          </div>
          <div className={styles.option}>
            <span>Slutkundens minsta order</span>
            <NumberField label="Slutkundens minsta order" value={draft.endMinOrderSek} unit="kr" max={MAX_PRICE_SEK} onChange={(endMinOrderSek) => setDraft({ ...draft, endMinOrderSek })} />
            <small>Minsta belopp slutkunden betalar för en order</small>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-calc">
        <h2 id="price-model-calc" className={styles.cardTitle}>
          Vid order
        </h2>
        <p className={styles.muted}>Räknar på siffrorna ovan direkt, även innan de är sparade.</p>
        <div className={styles.calcInputs}>
          <label className={styles.calcField}>
            <span>Skylt</span>
            <select value={signClass} onChange={(event) => setSignClass(event.target.value as SignClass)}>
              {SIGN_ROWS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <div className={`${styles.calcField} ${styles.narrow}`}>
            <span>Antal</span>
            <NumberField label="Antal skyltar" value={quantity} unit="st" max={100_000} onChange={setQuantity} />
          </div>
          <label className={styles.calcField}>
            <span>Fäste</span>
            <select value={mounting} onChange={(event) => setMounting(event.target.value as MountingId)}>
              {OFFERED_MOUNTINGS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={logo} onChange={(event) => setLogo(event.target.checked)} />
            Logga (extra gravyr)
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={customShape} onChange={(event) => setCustomShape(event.target.checked)} />
            Egen design
          </label>
          <div className={`${styles.calcField} ${styles.narrow}`}>
            <span>Välj %</span>
            <NumberField
              label="Slutkundens marginal i kalkylen"
              value={draft.endMarginPercent}
              unit="%"
              max={MAX_MARGIN_PERCENT}
              decimals
              onChange={(endMarginPercent) => setDraft({ ...draft, endMarginPercent })}
            />
          </div>
        </div>

        <dl className={styles.results}>
          <div className={styles.result}>
            <dt>ÅF betalar</dt>
            <dd>{formatSek(reseller.totalSek)}</dd>
            <small>
              {perSign(reseller.totalSek)}
              {reseller.minimumTopUpSek > 0 && " · minidebitering"}
            </small>
          </div>
          <div className={styles.result}>
            <dt>Skylt &amp; Gravyr netto</dt>
            <dd>{formatSek(split.supplierSek)}</dd>
            <small>{perSign(split.supplierSek)}</small>
          </div>
          <div className={styles.result}>
            <dt>Merchin netto</dt>
            <dd>{formatSek(split.provisionSek)}</dd>
            <small>
              {String(split.provisionPercent).replace(".", ",")} % provision · {tierRangeLabel(reseller.tierIndex, purchase)}
            </small>
          </div>
          <div className={styles.result}>
            <dt>Rek. slutkund</dt>
            <dd>{formatSek(end.totalSek)}</dd>
            <small>
              {perSign(end.totalSek)}
              {end.minimumTopUpSek > 0 && " · minsta order"}
            </small>
          </div>
          <div className={styles.result} data-tone={margin.sek < 0 ? "bad" : undefined}>
            <dt>ÅF:s marginal</dt>
            <dd>{formatSek(margin.sek)}</dd>
            <small>{margin.percent !== null ? `${margin.percent} % av slutkundens pris` : "—"}</small>
          </div>
          <div className={styles.result} data-tone="own">
            <dt>Säljs på namnskylt.com</dt>
            <dd>{formatSek(split.provisionSek + margin.sek)}</dd>
            <small>Provision plus marginal när ni säljer själva</small>
          </div>
        </dl>
      </section>

      <div className={styles.actions}>
        <button type="button" className="btn btn--primary" disabled={pending || !dirty || !parsed.success} onClick={save}>
          {pending ? "Sparar…" : "Spara prismodellen"}
        </button>
        <button type="button" className="btn btn--ghost" disabled={pending || !dirty} onClick={() => setDraft(saved)}>
          Ångra ändringar
        </button>
        {problem && (
          <span className={styles.message} data-ok="false" role="alert">
            {problem}
          </span>
        )}
        {!problem && message && (
          <span className={styles.message} data-ok={message.ok} role="status">
            {message.text}
          </span>
        )}
      </div>
      <p className={styles.muted}>
        Sparade siffror styr priserna på sajten, i butikerna och för nya ordrar och offerter. Ordrar och offerter som redan finns
        behåller priserna de skapades med.
      </p>
    </div>
  );
}

interface SignRowsProps {
  row: (typeof SIGN_ROWS)[number];
  draft: PriceModel;
  onChange: (next: PriceModel) => void;
}

/** En skylttyp: återförsäljarens pris per trappsteg, och under det vad verkstaden får och vad slutkunden betalar. */
function SignRows({ row, draft, onChange }: SignRowsProps) {
  const prices = draft.signs[row.id];
  return (
    <>
      <span className={styles.divider} />
      <span className={styles.rowLabel}>
        {row.name}
        <small>{row.note}</small>
      </span>
      {prices.map((price, i) => (
        <NumberField
          key={i}
          label={`${row.name}, ${tierRangeLabel(i, resellerPriceTable(draft))}`}
          value={price}
          unit="kr"
          max={MAX_PRICE_SEK}
          onChange={(value) => onChange({ ...draft, signs: { ...draft.signs, [row.id]: replaceAt(prices, i, value) } })}
        />
      ))}
      <span className={styles.derivedLabel}>Skylt &amp; Gravyr netto</span>
      {prices.map((price, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(Math.round(price * (1 - (draft.tiers[i]?.provisionPercent ?? 0) / 100)))}
        </span>
      ))}
      <span className={styles.derivedLabel}>Slutkund</span>
      {prices.map((price, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(endPriceSek(price, draft))}
        </span>
      ))}
    </>
  );
}
