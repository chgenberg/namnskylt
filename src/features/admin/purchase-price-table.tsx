import { OFFERED_MATERIALS, OFFERED_MOUNTINGS, endPriceSek, mountingResellerSek, tierRangeLabel, type PriceModel } from "@/engine";
import { formatSek } from "@/lib/format";
import styles from "./price-model.module.css";

interface PurchasePriceTableProps {
  model: PriceModel;
}

/** Återförsäljarens inköpspriser ur prismodellen, med det rekommenderade priset till kund. Går inte att ändra här. */
export function PurchasePriceTable({ model }: PurchasePriceTableProps) {
  const tillval = [
    ...OFFERED_MOUNTINGS.map((m) => ({ name: m.name, sek: mountingResellerSek(m.id, model) })),
    { name: "Logga på skylten", sek: model.options.extraEngraving },
  ];
  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="purchase-signs">
        <h2 id="purchase-signs" className={styles.cardTitle}>
          Per skylt
        </h2>
        <p className={styles.muted}>
          Priset följer orderns totala antal, även när alla skyltar har olika namn. Varje skylt får ett fäste, som läggs till
          skyltpriset.
        </p>
        <div className={styles.table}>
          <span className={styles.rowLabel}>Antal i ordern</span>
          {model.tiers.map((_, i) => (
            <span key={i} className={styles.columnHead}>
              {tierRangeLabel(i, model)}
            </span>
          ))}
          {OFFERED_MATERIALS.map((material) => {
            const prices = model.signs[material.priceClass];
            return (
              <PriceRows key={material.id} name={`${material.name}skylt`} prices={prices} model={model} />
            );
          })}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="purchase-options">
        <h2 id="purchase-options" className={styles.cardTitle}>
          Tillval och minsta order
        </h2>
        <dl className={styles.results}>
          {tillval.map((row) => (
            <div key={row.name} className={styles.result}>
              <dt>{row.name}</dt>
              <dd>{formatSek(row.sek)}</dd>
              <small>rek. kundpris {formatSek(endPriceSek(row.sek, model))}</small>
            </div>
          ))}
          <div className={styles.result} data-tone="own">
            <dt>Minsta ordervärde</dt>
            <dd>{formatSek(model.minOrderSek)}</dd>
            <small>per order, exkl. moms</small>
          </div>
        </dl>
        <p className={styles.muted}>
          Alla priser är exkl. moms. Det rekommenderade kundpriset ger dig {String(model.endMarginPercent).replace(".", ",")} %
          marginal; du sätter ditt eget pris på varje order och offert och i din butik.
        </p>
      </section>
    </div>
  );
}

interface PriceRowsProps {
  name: string;
  prices: readonly number[];
  model: PriceModel;
}

function PriceRows({ name, prices, model }: PriceRowsProps) {
  return (
    <>
      <span className={styles.divider} />
      <span className={styles.rowLabel}>
        {name}
        <small>Ditt inköp</small>
      </span>
      {prices.map((price, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(price)}
        </span>
      ))}
      <span className={styles.derivedLabel}>Rek. kundpris</span>
      {prices.map((price, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(endPriceSek(price, model))}
        </span>
      ))}
    </>
  );
}
