import {
  MARKING_METHODS,
  OFFERED_MATERIALS,
  OFFERED_MOUNTINGS,
  markingPriceSek,
  mountingPriceSek,
  optionPriceSek,
  tierRangeLabel,
  type PriceOptionId,
  type PriceTable,
} from "@/engine";
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
  const perTier = (price: (table: PriceTable, tierIndex: number) => number) => ({
    prices: purchase.tiers.map((_, i) => price(purchase, i)),
    listPrices: list.tiers.map((_, i) => price(list, i)),
  });
  const option = (id: PriceOptionId) => perTier((table, i) => optionPriceSek(id, table, i));
  const options = [
    ...OFFERED_MOUNTINGS.map((m) => ({ name: `Fäste: ${m.name}`, ...perTier((table, i) => mountingPriceSek(m.id, table, i)) })),
    { name: "Logga på skylten", ...option("extraEngraving") },
    ...(OFFERED_MATERIALS.some((m) => m.customShape) ? [{ name: "Egen form", ...option("customShape") }] : []),
    // Märkningsmetoden kunden väljer. 0 kr betyder att metoden ingår i skylten.
    ...MARKING_METHODS.map((method) => ({
      name: `Märkning: ${method.name}`,
      ...perTier((table, i) => markingPriceSek(method.id, table, i)),
    })),
  ];
  const shipping = purchase.shipping;
  const tierHead = (
    <>
      <span className={styles.headLabel}>Antal i ordern</span>
      {purchase.tiers.map((_, i) => (
        <span key={i} className={styles.columnHead}>
          {tierRangeLabel(i, purchase)}
        </span>
      ))}
    </>
  );
  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="purchase-signs">
        <div className={styles.cardHead}>
          <h2 id="purchase-signs" className={styles.cardTitle}>
            Per skylt
          </h2>
          <p className={styles.muted}>
            Priset följer orderns totala antal, även när alla skyltar har olika namn. Varje skylt får ett fäste, som läggs till
            skyltpriset.
          </p>
        </div>
        <div className={styles.scroll}>
          <div className={styles.table}>
            {tierHead}
            {OFFERED_MATERIALS.map((material) => (
              <PriceRows
                key={material.id}
                name={`${material.name}skylt`}
                prices={purchase.signs[material.priceClass]}
                listPrices={list.signs[material.priceClass]}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="purchase-options">
        <div className={styles.cardHead}>
          <h2 id="purchase-options" className={styles.cardTitle}>
            Fästen och tillval
          </h2>
          <p className={styles.muted}>Läggs på skyltpriset, per skylt.</p>
        </div>
        <div className={styles.scroll}>
          <div className={styles.table}>
            {tierHead}
            {options.map((row) => (
              <PriceRows key={row.name} name={row.name} prices={row.prices} listPrices={row.listPrices} />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="purchase-order">
        <h2 id="purchase-order" className={styles.cardTitle}>
          Per order
        </h2>
        <dl className={styles.results}>
          <div className={styles.result}>
            <dt>Startkostnad</dt>
            <dd>{formatSek(purchase.startSek)}</dd>
            <small>
              per order, delas på antalet skyltar och ingår i priset per skylt · rek. kundpris {formatSek(list.startSek)}
            </small>
          </div>
          <div className={styles.result} data-tone="own">
            <dt>Minsta ordervärde</dt>
            <dd>{formatSek(purchase.minOrderSek)}</dd>
            <small>per order, exkl. moms</small>
          </div>
          {shipping && shipping.letterSek + shipping.parcelSek > 0 && (
            <div className={styles.result}>
              <dt>Frakt</dt>
              <dd>
                {formatSek(shipping.letterSek)} eller {formatSek(shipping.parcelSek)}
              </dd>
              <small>
                per order: {formatSek(shipping.letterSek)} som varubrev{" "}
                {typeof shipping.letterMaxSigns === "number"
                  ? `för högst ${shipping.letterMaxSigns} skyltar`
                  : `när varorna kostar dig högst ${formatSek(shipping.letterMaxSek)}`}
                , annars {formatSek(shipping.parcelSek)} som paket. Den som beställer kan välja paket i stället för
                varubrev. Din kund betalar samma frakt som du.
              </small>
            </div>
          )}
        </dl>
        <p className={styles.muted}>
          Alla priser är exkl. moms. Det rekommenderade kundpriset ger dig {String(marginPercent).replace(".", ",")} %
          marginal; du sätter ditt eget pris på varje order och offert och i din butik.
        </p>
        <p className={styles.muted}>
          Skylt &amp; Gravyrteknik tillverkar och skickar skyltarna, och fakturerar dig inköpspriset och frakten. Du
          fakturerar själv din kund.
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
