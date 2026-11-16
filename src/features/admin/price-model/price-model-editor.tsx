"use client";

import { useState, useTransition } from "react";
import { MARKING_METHODS, MARKING_OPTION, tierRangeLabel, type PriceOptionId, type SignClass } from "@/engine";
import {
  MAX_MARGIN_PERCENT,
  MAX_PRICE_SEK,
  endPriceSek,
  priceModelSchema,
  provisionPercentRange,
  resellerPriceTable,
  type PriceModel,
} from "@/engine/price-model";
import { formatPercent, formatSek } from "@/lib/format";
import { savePriceModelAction } from "../actions";
import { NumberField } from "./number-field";
import { PriceCalculator } from "./price-calculator";
import { PriceGroup } from "./price-group";
import styles from "../price-model.module.css";

const SIGN_ROWS: readonly { id: SignClass; name: string; note: string }[] = [
  { id: "premium", name: "Premium", note: "Metallskyltarna" },
  { id: "standard", name: "Standard", note: "Plastskyltarna" },
];

const OPTION_ROWS: readonly { id: PriceOptionId; name: string; note: string }[] = [
  { id: "pin", name: "Nål", note: "Fäste" },
  { id: "clip", name: "Militärklämma", note: "Fäste, heter Klämma på sajten" },
  { id: "magnet", name: "Magnet", note: "Fäste" },
  { id: "extraEngraving", name: "Extra gravyr eller print", note: "Loggan på skylten" },
  { id: "customShape", name: "Egen design, max 12 × 12 cm", note: "Plast i egen form" },
];

/** De fyra märkningsmetoderna, i samma ordning och med samma namn som i skyltmotorn. 0 kr betyder att metoden ingår. */
const MARKING_ROWS: readonly { id: PriceOptionId; name: string; note: string }[] = MARKING_METHODS.map((method) => ({
  id: MARKING_OPTION[method.id],
  name: method.name,
  note: method.description,
}));

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

/** Provisionen på hela ordern när den ligger på trappsteget: ett tal, eller lägsta och högsta. */
function orderPercentText(model: PriceModel, tierIndex: number): string {
  const { min, max } = provisionPercentRange(model, tierIndex);
  return min === max ? formatPercent(max) : `${formatPercent(min).replace(" %", "")}–${formatPercent(max)}`;
}

interface PriceModelEditorProps {
  model: PriceModel;
}

/**
 * Prismodellen som i kalkylbladet: trappsteg, provision och startkostnad,
 * återförsäljarens priser på skyltar, fästen och tillval, och under varje pris
 * vad som går till verkstaden, vad som blir provision och vad slutkunden
 * betalar. Kalkylen längst ned räknar på utkastet direkt; först när det sparas
 * gäller siffrorna.
 */
export function PriceModelEditor({ model }: PriceModelEditorProps) {
  const [saved, setSaved] = useState(model);
  const [draft, setDraft] = useState(model);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = priceModelSchema.safeParse(draft);
  const problem = parsed.success ? null : (parsed.error.issues[0]?.message ?? "Ogiltiga siffror");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const purchase = resellerPriceTable(draft);
  const tierLabels = draft.tiers.map((_, i) => tierRangeLabel(i, purchase));

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

  const tierHead = (
    <>
      <span className={styles.headLabel}>Antal i ordern</span>
      {tierLabels.map((label, i) => (
        <span key={i} className={styles.columnHead}>
          {label}
        </span>
      ))}
    </>
  );

  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="price-model-tiers">
        <div className={styles.cardTop}>
          <div className={styles.cardHead}>
            <h2 id="price-model-tiers" className={styles.cardTitle}>
              Trappsteg och provision
            </h2>
            <p className={styles.muted}>
              Priset följer orderns totala antal. Provisionen är er andel av allt återförsäljaren betalar: skyltar, fästen,
              tillval och startkostnad. Den räknas steg för steg: varje procentsats gäller bara skyltarna inom sitt
              trappsteg. Resten går till Skylt &amp; Gravyrteknik.
            </p>
          </div>
          <div className={`${styles.orderField} ${styles.startField}`}>
            <span className={styles.controlLabel}>Startkostnad</span>
            <NumberField
              label="Startkostnad per order, det återförsäljaren betalar"
              value={draft.startSek}
              unit="kr"
              max={MAX_PRICE_SEK}
              decimals
              onChange={(startSek) => setDraft({ ...draft, startSek })}
            />
            <small>
              Per order, delas på antalet skyltar. Slutkund {formatSek(endPriceSek(draft.startSek, draft))}.
            </small>
          </div>
        </div>
        <div className={styles.scroll}>
          <div className={styles.table}>
            {tierHead}
            <span className={styles.divider} />
            <span className={styles.rowLabel}>
              Gäller över
              <small>Trappsteget börjar när ordern har fler skyltar än så</small>
            </span>
            {draft.tiers.map((tier, i) =>
              i === 0 ? (
                <span key={i} className={styles.same}>
                  0 st
                </span>
              ) : (
                <NumberField
                  key={i}
                  label={`Trappsteg ${i + 1} gäller när ordern har fler skyltar än`}
                  value={tier.moreThan}
                  unit="st"
                  max={1_000_000}
                  onChange={(moreThan) => setDraft({ ...draft, tiers: replaceAt(draft.tiers, i, { ...tier, moreThan }) })}
                />
              ),
            )}
            <span className={styles.divider} />
            <span className={styles.rowLabel}>
              Provision
              <small>Merchins andel av skyltarna inom trappsteget</small>
            </span>
            {draft.tiers.map((tier, i) => (
              <NumberField
                key={i}
                label={`Provision, ${tierLabels[i] ?? ""}`}
                value={tier.provisionPercent}
                unit="%"
                max={MAX_MARGIN_PERCENT}
                decimals
                onChange={(provisionPercent) => setDraft({ ...draft, tiers: replaceAt(draft.tiers, i, { ...tier, provisionPercent }) })}
              />
            ))}
            <span className={styles.derivedLabel}>På hela ordern</span>
            {draft.tiers.map((_, i) => (
              <span key={i} className={styles.derived}>
                {orderPercentText(draft, i)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-signs">
        <div className={styles.cardHead}>
          <h2 id="price-model-signs" className={styles.cardTitle}>
            Typ av skylt
          </h2>
          <p className={styles.muted}>
            Det återförsäljaren betalar per skylt, och hur beloppet fördelas. Två belopp gäller trappstegets första och sista
            antal, eftersom provisionen räknas steg för steg.
          </p>
        </div>
        <div className={styles.scroll}>
          <div className={styles.table}>
            {tierHead}
            {SIGN_ROWS.map((row) => (
              <PriceGroup
                key={row.id}
                name={row.name}
                note={row.note}
                prices={draft.signs[row.id]}
                model={draft}
                tierLabels={tierLabels}
                onChange={(i, value) => setDraft({ ...draft, signs: { ...draft.signs, [row.id]: replaceAt(draft.signs[row.id], i, value) } })}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-options">
        <div className={styles.cardHead}>
          <h2 id="price-model-options" className={styles.cardTitle}>
            Tillbehör och tillval
          </h2>
          <p className={styles.muted}>Det återförsäljaren betalar per skylt på varje trappsteg, och hur beloppet fördelas.</p>
        </div>
        <div className={styles.scroll}>
          <div className={styles.table}>
            {tierHead}
            {OPTION_ROWS.map((row) => (
              <PriceGroup
                key={row.id}
                name={row.name}
                note={row.note}
                prices={draft.options[row.id]}
                model={draft}
                tierLabels={tierLabels}
                onChange={(i, value) =>
                  setDraft({ ...draft, options: { ...draft.options, [row.id]: replaceAt(draft.options[row.id], i, value) } })
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-marking">
        <div className={styles.cardHead}>
          <h2 id="price-model-marking" className={styles.cardTitle}>
            Märkningsmetod
          </h2>
          <p className={styles.muted}>
            Det återförsäljaren betalar per skylt för metoden kunden väljer i skyltmotorn. Med 0 kr ingår metoden och visas
            som &quot;Ingår&quot;. De kombinerade metoderna går bara att välja på en skylt med logga.
          </p>
        </div>
        <div className={styles.scroll}>
          <div className={styles.table}>
            {tierHead}
            {MARKING_ROWS.map((row) => (
              <PriceGroup
                key={row.id}
                name={row.name}
                note={row.note}
                prices={draft.options[row.id]}
                model={draft}
                tierLabels={tierLabels}
                onChange={(i, value) =>
                  setDraft({ ...draft, options: { ...draft.options, [row.id]: replaceAt(draft.options[row.id], i, value) } })
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-order">
        <div className={styles.cardHead}>
          <h2 id="price-model-order" className={styles.cardTitle}>
            Per order
          </h2>
        </div>
        <div className={styles.orderGrid}>
          <div className={styles.orderField}>
            <span className={styles.controlLabel}>Minidebitering</span>
            <NumberField
              label="Minidebitering"
              value={draft.minOrderSek}
              unit="kr"
              max={MAX_PRICE_SEK}
              decimals
              onChange={(minOrderSek) => setDraft({ ...draft, minOrderSek })}
            />
            <small>Minsta belopp återförsäljaren betalar för en order</small>
          </div>
          <div className={styles.orderField}>
            <span className={styles.controlLabel}>Slutkundens marginal</span>
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
          <div className={styles.orderField}>
            <span className={styles.controlLabel}>Slutkundens minsta order</span>
            <NumberField label="Slutkundens minsta order" value={draft.endMinOrderSek} unit="kr" max={MAX_PRICE_SEK} onChange={(endMinOrderSek) => setDraft({ ...draft, endMinOrderSek })} />
            <small>Minsta belopp slutkunden betalar för en order, i hela kronor</small>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-shipping">
        <div className={styles.cardHead}>
          <h2 id="price-model-shipping" className={styles.cardTitle}>
            Frakt
          </h2>
          <p className={styles.muted}>
            Skylt &amp; Gravyrtekniks frakt, rakt av. Den räknas på det återförsäljaren betalar för varorna, och slutkunden
            betalar samma belopp, utan provision och marginal.
          </p>
        </div>
        <div className={styles.orderGrid}>
          <div className={styles.orderField}>
            <span className={styles.controlLabel}>Varubrev</span>
            <NumberField
              label="Frakt som varubrev"
              value={draft.shipping.letterSek}
              unit="kr"
              max={MAX_PRICE_SEK}
              onChange={(letterSek) => setDraft({ ...draft, shipping: { ...draft.shipping, letterSek } })}
            />
            <small>PostNord, för en order upp till gränsen</small>
          </div>
          <div className={styles.orderField}>
            <span className={styles.controlLabel}>Gräns för varubrev</span>
            <NumberField
              label="Högsta varuvärde för varubrev"
              value={draft.shipping.letterMaxSek}
              unit="kr"
              max={MAX_PRICE_SEK}
              onChange={(letterMaxSek) => setDraft({ ...draft, shipping: { ...draft.shipping, letterMaxSek } })}
            />
            <small>Det återförsäljaren betalar för varorna, exkl. moms och frakt</small>
          </div>
          <div className={styles.orderField}>
            <span className={styles.controlLabel}>Paket</span>
            <NumberField
              label="Frakt som paket"
              value={draft.shipping.parcelSek}
              unit="kr"
              max={MAX_PRICE_SEK}
              onChange={(parcelSek) => setDraft({ ...draft, shipping: { ...draft.shipping, parcelSek } })}
            />
            <small>DHL, för en order över gränsen</small>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="price-model-calc">
        <div className={styles.cardHead}>
          <h2 id="price-model-calc" className={styles.cardTitle}>
            Vid order
          </h2>
          <p className={styles.muted}>Räknar på siffrorna ovan direkt, även innan de är sparade.</p>
        </div>
        <PriceCalculator model={draft} onMarginChange={(endMarginPercent) => setDraft({ ...draft, endMarginPercent })} />
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
