import { OFFERED_MATERIALS, OFFERED_MOUNTINGS, mountingPriceSek, tierRangeLabel, type PriceTable } from "@/engine";
import { formatSek } from "@/lib/format";
import styles from "./price-model.module.css";

interface PurchasePriceTableProps {
  /** Det återförsäljaren betalar. */
  purchase: PriceTable;
  /** Det rekommenderade priset till kund. */
  list: PriceTable;
  /** Återförsäljarens marginal vid det rekommenderade priset, i procent. */
  marginPercent: number;
}

/**
 * Återförsäljarens inköpspriser med det rekommenderade priset till kund. Går inte att ändra här.
 * Tar bara emot de två prislistorna — hela prismodellen, med provisionen, når aldrig den här sidan.
 */
export function PurchasePriceTable({ purchase, list, marginPercent }: PurchasePriceTableProps) {
  const options = [
    ...OFFERED_MOUNTINGS.map((m) => ({ name: m.name, sek: mountingPriceSek(m.id, purchase), listSek: mountingPriceSek(m.id, list) })),
    { name: "Logga på skylten", sek: purchase.options.extraEngraving, listSek: list.options.extraEngraving },
    ...(OFFERED_MATERIALS.some((m) => m.customShape)
      ? [{ name: "Egen form", sek: purchase.options.customShape, listSek: list.options.customShape }]
      : []),
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
          {purchase.tiers.map((_, i) => (
            <span key={i} className={styles.columnHead}>
              {tierRangeLabel(i, purchase)}
            </span>
          ))}
          {OFFERED_MATERIALS.map((material) => (
            <PriceRows
              key={material.id}
              name={`${material.name}skylt`}
              prices={purchase.signs[material.priceClass]}
              listPrices={list.signs[material.priceClass]}
            />
          ))}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="purchase-options">
        <h2 id="purchase-options" className={styles.cardTitle}>
          Tillval och minsta order
        </h2>
        <dl className={styles.results}>
          {options.map((row) => (
            <div key={row.name} className={styles.result}>
              <dt>{row.name}</dt>
              <dd>{formatSek(row.sek)}</dd>
              <small>rek. kundpris {formatSek(row.listSek)}</small>
            </div>
          ))}
          <div className={styles.result} data-tone="own">
            <dt>Minsta ordervärde</dt>
            <dd>{formatSek(purchase.minOrderSek)}</dd>
            <small>per order, exkl. moms</small>
          </div>
        </dl>
        <p className={styles.muted}>
          Alla priser är exkl. moms. Det rekommenderade kundpriset ger dig {String(marginPercent).replace(".", ",")} %
          marginal; du sätter ditt eget pris på varje order och offert och i din butik.
        </p>
      </section>
    </div>
  );
}

interface PriceRowsProps {
  name: string;
  prices: readonly number[];
  listPrices: readonly number[];
}

function PriceRows({ name, prices, listPrices }: PriceRowsProps) {
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
      {listPrices.map((price, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(price)}
        </span>
      ))}
    </>
  );
}
