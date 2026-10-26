import type { ReactNode } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { createBadgeDocument, type BadgeDocument, type MaterialId } from "@/engine";
import type { HowItWorksFlow } from "./how-it-works-copy";
import styles from "./how-it-works.module.css";

function badge(texts: string[], materialId: MaterialId = "plastic-2-layer", colorId = "white-black"): BadgeDocument {
  return { ...createBadgeDocument(texts), materialId, colorId };
}

function Node({ children, filled = false, className }: { children: ReactNode; filled?: boolean; className?: string }) {
  return (
    <div className={`${styles.node} ${className ?? ""}`} data-filled={filled}>
      {children}
    </div>
  );
}

function Dot({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <span className={styles.dot} data-filled={filled} aria-hidden="true">
      {children}
    </span>
  );
}

/** Linjer som delar sig från en punkt överst till `count` punkter nederst. */
function Branch({ count }: { count: number }) {
  const xs = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100);
  return (
    <svg className={styles.branch} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      {xs.map((x) => (
        <path key={x} d={`M50 0 C50 22, ${x} 18, ${x} 40`} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Down() {
  return <span className={styles.down} aria-hidden="true" />;
}

const icon = {
  text: <path d="M4 7h16M4 12h10M4 17h7" />,
  camera: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M9 7l1.5-3h3L15 7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  laser: <path d="M12 3v7M8 21l4-8 4 8M5 10h14" />,
  box: (
    <>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} as const;

function Icon({ name }: { name: keyof typeof icon }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={styles.icon} aria-hidden="true">
      {icon[name]}
    </svg>
  );
}

function WriteFlow() {
  return (
    <div className={styles.flow}>
      <Node className={styles.searchNode}>
        <Dot filled>
          <Icon name="text" />
        </Dot>
        <span>
          Anna Lindqvist, Projektledare<span className={styles.caret} />
        </span>
      </Node>
      <Branch count={2} />
      <div className={styles.cols2}>
        <Node>
          <span className={styles.tag}>Namn</span>Anna Lindqvist
        </Node>
        <Node>
          <span className={styles.tag}>Titel</span>Projektledare
        </Node>
      </div>
      <Down />
      <BadgePreview doc={badge(["Anna Lindqvist", "Projektledare"])} className={styles.badge} />
    </div>
  );
}

const MATERIAL_SAMPLES = [
  { label: "Gravyrplast", doc: badge(["Erik Holm", "Överläkare"], "plastic-2-layer", "darkblue-white") },
  { label: "Aluminium", doc: badge(["Erik Holm", "Överläkare"], "aluminium-anodized", "alu-natural-black") },
  { label: "Rostfritt", doc: badge(["Erik Holm", "Överläkare"], "stainless", "steel-laser") },
];

function DesignFlow() {
  return (
    <div className={styles.flow}>
      <Node filled className={styles.center}>
        <Dot>
          <Icon name="check" />
        </Dot>
        Din skylt
      </Node>
      <Branch count={3} />
      <div className={styles.cols3}>
        {MATERIAL_SAMPLES.map((sample) => (
          <Node key={sample.label} className={styles.stack}>
            <BadgePreview doc={sample.doc} className={styles.badgeSmall} label={`Exempel i ${sample.label}`} />
            <span className={styles.small}>{sample.label}</span>
          </Node>
        ))}
      </div>
    </div>
  );
}

function PreviewFlow() {
  return (
    <div className={styles.flow}>
      <Node className={styles.center}>
        <Dot filled>
          <Icon name="camera" />
        </Dot>
        Ditt foto eller en person
      </Node>
      <Branch count={3} />
      <div className={styles.cols3}>
        {[0, 1, 2].map((i) => (
          <Node key={i} className={styles.portrait}>
            <span className={styles.bust} aria-hidden="true">
              <span className={styles.bustBadge} />
            </span>
          </Node>
        ))}
      </div>
    </div>
  );
}

const TEAM: readonly (readonly [name: string, title: string])[] = [
  ["Erik Holm", "Överläkare"],
  ["Wilma Berg", "Barista"],
  ["Marcus Holm", "VD"],
];

function TeamFlow() {
  return (
    <div className={styles.flow}>
      <Node className={styles.listNode}>
        <span className={styles.listHead}>
          <Dot filled>
            <Icon name="list" />
          </Dot>
          Fler namn
        </span>
        {TEAM.map(([name, title]) => (
          <span key={name} className={`mono ${styles.listLine}`}>
            {name}, {title}
          </span>
        ))}
      </Node>
      <Branch count={3} />
      <div className={styles.cols3}>
        {TEAM.map(([name, title]) => (
          <BadgePreview
            key={name}
            doc={badge([name, title], "plastic-2-layer", "black-white")}
            className={styles.badgeSmall}
          />
        ))}
      </div>
      <Down />
      <Node filled className={styles.center}>
        Mängdrabatt på hela ordern · upp till −40 %
      </Node>
    </div>
  );
}

const DELIVERY = [
  { label: "Produktionsfil", icon: "check" },
  { label: "Gravyr", icon: "laser" },
  { label: "Leverans", icon: "box" },
] as const;

function DeliverFlow() {
  return (
    <div className={styles.flow}>
      <ol className={styles.chain}>
        {DELIVERY.map((step, i) => (
          <li key={step.label}>
            <Node className={styles.stack}>
              <Dot filled={i === DELIVERY.length - 1}>
                <Icon name={step.icon} />
              </Dot>
              <span className={styles.small}>{step.label}</span>
            </Node>
          </li>
        ))}
      </ol>
      <Down />
      <Node className={styles.center}>
        <span className={styles.tag}>Skylt &amp; Gravyrteknik</span>
        Inom 5 arbetsdagar
      </Node>
    </div>
  );
}

const FLOWS: Record<HowItWorksFlow, () => ReactNode> = {
  write: WriteFlow,
  design: DesignFlow,
  preview: PreviewFlow,
  team: TeamFlow,
  deliver: DeliverFlow,
};

export function HowItWorksFlowImage({ flow, label }: { flow: HowItWorksFlow; label: string }) {
  const Flow = FLOWS[flow];
  return (
    <div className={styles.panel} role="img" aria-label={label}>
      <Flow />
    </div>
  );
}
