"use client";

import { useState } from "react";
import {
  OFFERED_MOUNTINGS,
  priceItems,
  tierRangeLabel,
  type MountingId,
  type PriceItem,
  type PricePart,
  type SignClass,
  toOre,
} from "@/engine";
import {
  MAX_MARGIN_PERCENT,
  endPriceTable,
  itemBreakdown,
  provisionSplit,
  resellerPriceTable,
  tierCounts,
  type PriceModel,
} from "@/engine/price-model";
import { Segmented } from "@/components/ui/segmented";
import { formatPercent, formatSek } from "@/lib/format";
import { marginOf } from "@/lib/orders/purchase";
import { NumberField } from "./number-field";
import { OptionChip } from "./option-chip";
import { ShareTable } from "./share-table";
import styles from "../price-model.module.css";

const SIGN_NAMES: Record<SignClass, string> = { premium: "Premium", standard: "Standard" };
const SIGN_OPTIONS = (["premium", "standard"] as const).map((id) => ({ id, label: SIGN_NAMES[id] }));
const STEP_LIST = new Intl.ListFormat("sv", { type: "conjunction" });

/** Kalkylen kan räkna på skylten utan fäste, så att skyltens egna siffror syns för sig. Det går inte att beställa så. */
type CalculatorMounting = MountingId | "none";
const MOUNTING_OPTIONS: { id: CalculatorMounting; label: string }[] = [
  ...OFFERED_MOUNTINGS.map((mounting) => ({ id: mounting.id, label: mounting.name })),
  { id: "none", label: "Utan" },
];

interface PriceCalculatorProps {
  /** Utkastet: kalkylen räknar på siffrorna direkt, även innan de är sparade. */
  model: PriceModel;
  onMarginChange: (percent: number) => void;
}

/** "Vid order": välj en skylt och ett antal och se vad varje part får, i summa och per skylt. */
export function PriceCalculator({ model, onMarginChange }: PriceCalculatorProps) {
  const [signClass, setSignClass] = useState<SignClass>("premium");
  const [quantity, setQuantity] = useState(25);
  const [mounting, setMounting] = useState<CalculatorMounting>("pin");
  const [logo, setLogo] = useState(false);
  const [customShape, setCustomShape] = useState(false);

  const item: PriceItem = {
    signClass,
    mounting: mounting === "none" ? null : mounting,
    extraEngraving: logo,
    customShape,
    quantity: Math.max(1, quantity),
  };
  const purchase = resellerPriceTable(model);
  const reseller = priceItems([item], purchase);
  const end = priceItems([item], endPriceTable(model));
  // Frakten ligger utanför kedjan: kalkylen räknar på varuvärdet och visar frakten för sig.
  const split = provisionSplit(model, reseller.goodsSek, reseller.quantity);
  const margin = marginOf(end.goodsSek, reseller.goodsSek);
  const spec = itemBreakdown(model, item);
  const perSign = (sek: number) => `${formatSek(toOre(sek / reseller.quantity))} / st`;
  const tier = tierRangeLabel(reseller.tierIndex, purchase);
  /** Hur provisionen räknas fram: `100 st à 15 %, 200 st à 12 % och 50 st à 10 %`. */
  const steps = STEP_LIST.format(
    tierCounts(model, reseller.quantity)
      .map((count, i) => ({ count, percent: model.tiers[i]?.provisionPercent ?? 0 }))
      .filter((step) => step.count > 0)
      .map((step) => `${step.count} st à ${formatPercent(step.percent)}`),
  );

  const partNames: Record<PricePart, string> = {
    sign: `${SIGN_NAMES[signClass]}skylt, ${tier}`,
    mounting: `Fäste: ${OFFERED_MOUNTINGS.find((m) => m.id === mounting)?.name ?? ""}`,
    extraEngraving: "Logga (extra gravyr)",
    customShape: "Egen design",
    start: `Startkostnad, ${formatSek(model.startSek)} delat på ${reseller.quantity} st`,
  };

  return (
    <>
      <div className={styles.controls}>
        <div className={styles.control}>
          <span className={styles.controlLabel}>Skylt</span>
          <Segmented label="Typ av skylt" value={signClass} options={SIGN_OPTIONS} onChange={setSignClass} />
        </div>
        <div className={`${styles.control} ${styles.narrow}`}>
          <span className={styles.controlLabel}>Antal</span>
          <NumberField label="Antal skyltar" value={quantity} unit="st" max={100_000} onChange={setQuantity} />
        </div>
        <div className={styles.control}>
          <span className={styles.controlLabel}>Fäste</span>
          <Segmented label="Fäste" value={mounting} options={MOUNTING_OPTIONS} onChange={setMounting} />
        </div>
        <div className={styles.control}>
          <span className={styles.controlLabel}>Tillval</span>
          <div className={styles.chips}>
            <OptionChip label="Logga (extra gravyr)" checked={logo} onChange={setLogo} />
            <OptionChip label="Egen design" checked={customShape} onChange={setCustomShape} />
          </div>
        </div>
        <div className={`${styles.control} ${styles.narrow}`}>
          <span className={styles.controlLabel}>Välj %</span>
          <NumberField
            label="Slutkundens marginal i kalkylen"
            value={model.endMarginPercent}
            unit="%"
            max={MAX_MARGIN_PERCENT}
            decimals
            onChange={onMarginChange}
          />
        </div>
      </div>

      <dl className={styles.results}>
        <div className={styles.result}>
          <dt>ÅF betalar</dt>
          <dd>{formatSek(reseller.goodsSek)}</dd>
          <small>
            {perSign(reseller.goodsSek)}
            {reseller.minimumTopUpSek > 0 && " · minidebitering"}
          </small>
        </div>
        <div className={styles.result} data-tone="supplier">
          <dt>Skylt &amp; Gravyr netto</dt>
          <dd>{formatSek(split.supplierSek)}</dd>
          <small>{perSign(split.supplierSek)}</small>
        </div>
        <div className={styles.result}>
          <dt>Merchin netto</dt>
          <dd>{formatSek(split.provisionSek)}</dd>
          <small>
            {formatPercent(split.provisionPercent)} provision · {steps}
          </small>
        </div>
        <div className={styles.result}>
          <dt>Rek. slutkund</dt>
          <dd>{formatSek(end.goodsSek)}</dd>
          <small>
            {perSign(end.goodsSek)}
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
          <dd>{formatSek(toOre(split.provisionSek + margin.sek))}</dd>
          <small>Provision plus marginal när ni säljer själva</small>
        </div>
      </dl>

      <div className={styles.spec}>
        <h3 className={styles.specTitle}>Specifikation per skylt</h3>
        <p className={styles.muted}>
          Vad varje part får för skylten, fästet, tillvalen och skyltens del av startkostnaden. Provisionen är{" "}
          {formatPercent(split.provisionPercent)} på alla delar: {steps}.
        </p>
        <ShareTable
          spec={spec}
          partNames={partNames}
          quantity={reseller.quantity}
          totals={{ resellerSek: reseller.goodsSek, supplierSek: split.supplierSek, provisionSek: split.provisionSek, endSek: end.goodsSek }}
        />
        <p className={styles.footnote}>
          Provisionen räknas på orderns summa och avrundas till ören, och resten går till Skylt &amp; Gravyrteknik. Per skylt
          avrundas varje del för sig, så delarna gånger antalet kan skilja några ören från ordern. Startkostnaden per skylt
          avrundas till ören för återförsäljaren och till hela kronor för slutkunden.
        </p>
        {reseller.shippingSek > 0 && (
          <p className={styles.footnote}>
            Frakt {formatSek(reseller.shippingSek)} tillkommer, samma belopp för återförsäljaren och slutkunden. Den räknas på
            det återförsäljaren betalar för varorna. Frakten är Skylt &amp; Gravyrtekniks egen, utan provision och marginal,
            och går oavkortad till verkstaden. Den är inte med i beloppen ovan.
          </p>
        )}
      </div>
    </>
  );
}
