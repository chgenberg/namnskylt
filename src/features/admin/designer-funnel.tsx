import Link from "next/link";
import type { CSSProperties } from "react";
import {
  DESIGNER_STEP_HINT,
  FUNNEL_DAYS,
  FUNNEL_MIN_VISITS,
  WEB_SCOPE,
  biggestDropText,
  funnel,
} from "@/lib/designer-stats/model";
import { designerFunnelRows, designerScopes } from "@/lib/designer-stats/repository";
import { shopsOwnedBy } from "@/lib/shops/editor-repository";
import { isOwner } from "@/lib/tenants/model";
import adminStyles from "./admin.module.css";
import styles from "./designer-funnel.module.css";

interface DesignerFunnelProps {
  /** Den som är inloggad i panelen. */
  tenant: string;
  /** Valt sammanhang ur adressen: `web` eller en butiks adress. Ett val som inte är tillåtet faller tillbaka på det första. */
  selected?: string;
  /** Sidans adress, som valen länkar till. */
  path: string;
}

const scopeLabel = (scope: string) => (scope === WEB_SCOPE ? "namnskylt.com" : scope);

/**
 * Var besökare lämnar skyltmotorn, de senaste 30 dagarna. namnskylt.com ser
 * sin egen skyltmotor och varje butik som har haft besök; en återförsäljare
 * ser bara sina egna butiker.
 */
export async function DesignerFunnel({ tenant, selected, path }: DesignerFunnelProps) {
  const scopes = isOwner(tenant)
    ? [WEB_SCOPE, ...(await designerScopes()).map((row) => row.scope).filter((scope) => scope !== WEB_SCOPE)]
    : await shopsOwnedBy(tenant);
  const scope = selected && scopes.includes(selected) ? selected : scopes[0];
  // En återförsäljare utan butik har ingen skyltmotor att visa statistik för.
  if (!scope) return null;
  const rows = await designerFunnelRows(scope);
  const result = funnel(rows.furthest);
  const first = result.steps[0]?.visits ?? 0;

  return (
    <section className={`${adminStyles.panel} ${adminStyles.section}`}>
      <div className={adminStyles.sectionHead}>
        <h2 className={adminStyles.sectionTitle}>Skyltmotorn</h2>
        <span className={adminStyles.muted}>
          {FUNNEL_DAYS} dagar · {result.visits} besök
        </span>
      </div>

      {scopes.length > 1 && (
        <nav className={styles.scopes} aria-label="Välj skyltmotor">
          {scopes.map((item) => (
            <Link
              key={item}
              href={item === scopes[0] ? path : `${path}?motor=${encodeURIComponent(item)}`}
              className="chip"
              data-active={item === scope}
              aria-current={item === scope ? "true" : undefined}
              scroll={false}
            >
              {scopeLabel(item)}
            </Link>
          ))}
        </nav>
      )}

      {result.visits === 0 ? (
        <p className={adminStyles.muted}>Inga besök i skyltmotorn de senaste {FUNNEL_DAYS} dagarna.</p>
      ) : (
        <>
          <p className={styles.drop}>
            {!result.enough
              ? `För få besök för att säga var besökare lämnar: ${result.visits} hittills. Andelarna visas från ${FUNNEL_MIN_VISITS} besök.`
              : result.biggestDrop
                ? biggestDropText(result.biggestDrop)
                : "Alla besök gick hela vägen till en mottagen order."}
          </p>
          <ol className={styles.steps}>
            {result.steps.map((step) => (
              <li key={step.step} className={styles.step}>
                <div className={styles.stepHead}>
                  <strong>
                    {step.label}
                    {result.enough && result.biggestDrop?.to === step.step && <span className={styles.dropTag}>flest lämnar före det här steget</span>}
                  </strong>
                  <span className="mono">
                    {step.visits} besök
                    {result.enough && step.keptPercent !== null && ` · ${step.keptPercent} % gick vidare hit`}
                  </span>
                </div>
                <div className={styles.track}>
                  <div
                    className={styles.fill}
                    style={{ "--funnel-fill": `${first > 0 ? (step.visits / first) * 100 : 0}%` } as CSSProperties}
                  />
                </div>
                <p className={styles.stepHint}>{DESIGNER_STEP_HINT[step.step]}</p>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className={styles.foot}>
        Ett besök är en öppnad skyltmotor, och varje besök räknas till det steg det kom längst till.
        {rows.cartVisits > 0 && ` ${rows.cartVisits} besök lade en design i varukorgen.`} Inget sparas hos besökaren, och
        besöken går inte att koppla till en person. En återförsäljare som lägger en order åt en kund räknas inte.
      </p>
    </section>
  );
}
