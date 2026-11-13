"use client";

import { useState } from "react";
import { OFFERED_MOUNTINGS, priceItems, tierRangeLabel, type MountingId, type PriceItem, type SignClass } from "@/engine";
import {
  MAX_MARGIN_PERCENT,
  endPriceTable,
  itemBreakdown,
  provisionSplit,
  resellerPriceTable,
  type PriceModel,
  type PricePart,
} from "@/engine/price-model";
import { Segmented } from "@/components/ui/segmented";
import { formatSek } from "@/lib/format";
import { marginOf } from "@/lib/orders/purchase";
import { NumberField } from "./number-field";
import { OptionChip } from "./option-chip";
import { ShareTable } from "./share-table";
import styles from "../price-model.module.css";

const SIGN_NAMES: Record<SignClass, string> = { premium: "Premium", standard: "Standard" };
const SIGN_OPTIONS = (["premium", "standard"] as const).map((id) => ({ id, label: SIGN_NAMES[id] }));
const MOUNTING_OPTIONS = OFFERED_MOUNTINGS.map((mounting) => ({ id: mounting.id, label: mounting.name }));

const percentText = (value: number) => `${String(value).replace(".", ",")} %`;

interface PriceCalculatorProps {
  /** Utkastet: kalkylen räknar på siffrorna direkt, även innan de är sparade. */
  model: PriceModel;
  onMarginChange: (percent: number) => void;
}

/** "Vid order": välj en skylt och ett antal och se vad varje part får, i summa och per skylt. */
export function PriceCalculator({ model, onMarginChange }: PriceCalculatorProps) {
  const [signClass, setSignClass] = useState<SignClass>("premium");
  const [quantity, setQuantity] = useState(25);
  const [mounting, setMounting] = useState<MountingId>("pin");
  const [logo, setLogo] = useState(false);
  const [customShape, setCustomShape] = useState(false);

  const item: PriceItem = { signClass, mounting, extraEngraving: logo, customShape, quantity: Math.max(1, quantity) };
  const purchase = resellerPriceTable(model);
  const reseller = priceItems([item], purchase);
  const end = priceItems([item], endPriceTable(model));
  const split = provisionSplit(model, reseller.totalSek, reseller.quantity);
  const margin = marginOf(end.totalSek, reseller.totalSek);
  const spec = itemBreakdown(model, item);
  const perSign = (sek: number) => `${formatSek(Math.round(sek / reseller.quantity))} / st`;
  const tier = tierRangeLabel(reseller.tierIndex, purchase);

  const partNames: Record<PricePart, string> = {
    sign: `${SIGN_NAMES[signClass]}skylt, ${tier}`,
    mounting: `Fäste: ${OFFERED_MOUNTINGS.find((m) => m.id === mounting)?.name ?? ""}`,
    extraEngraving: "Logga (extra gravyr)",
    customShape: "Egen design",
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
          <dd>{formatSek(reseller.totalSek)}</dd>
          <small>
            {perSign(reseller.totalSek)}
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
            {percentText(split.provisionPercent)} provision · {tier}
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

      <div className={styles.spec}>
        <h3 className={styles.specTitle}>Specifikation per skylt</h3>
        <p className={styles.muted}>
          Vad varje part får för skylten, fästet och tillvalen. Provisionen är {percentText(split.provisionPercent)} på alla delar vid {tier}.
        </p>
        <ShareTable
          spec={spec}
          partNames={partNames}
          quantity={reseller.quantity}
          totals={{ resellerSek: reseller.totalSek, supplierSek: split.supplierSek, provisionSek: split.provisionSek, endSek: end.totalSek }}
        />
        <p className={styles.footnote}>
          Per skylt visas ören. På ordern avrundas provisionen till hela kronor, och resten går till Skylt &amp; Gravyrteknik.
        </p>
      </div>
    </>
  );
}
