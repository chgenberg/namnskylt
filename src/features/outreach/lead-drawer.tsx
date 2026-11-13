import adminStyles from "@/features/admin/admin.module.css";
import { formatDate } from "@/lib/format";
import { RELATION_SEGMENT_LABELS, relationSegment, type AssetReview, type MessageStatus } from "@/lib/outreach/model";
import type { LeadRow } from "@/lib/outreach/store";
import { LEAD_STATUS_LABEL, MESSAGE_STATUS_LABEL, WAVE_LABEL } from "./labels";
import styles from "./outreach.module.css";
import { PersonaReview } from "./persona-review";
import { StopLeadButton } from "./stop-lead-button";

export interface DrawerMessage {
  id: string;
  step: number;
  status: MessageStatus;
  subject: string | null;
  sentAt: Date | null;
  lastError: string | null;
  cancelReason: string | null;
}

interface LeadDrawerProps {
  lead: LeadRow;
  heroUrl: string | null;
  persona: { id: string; url: string; review: AssetReview } | null;
  /** Varför ett riktigt utskick inte skulle gå iväg just nu, i klartext. */
  blockers: string[];
  messages: DrawerMessage[];
  landingUrl: string | null;
}

const when = (date: Date | null) => (date ? formatDate(date.toISOString()) : "—");

export function LeadDrawer({ lead, heroUrl, persona, blockers, messages, landingUrl }: LeadDrawerProps) {
  const active = messages.some((m) => m.status === "ready" || m.status === "scheduled");
  return (
    <div className={styles.drawer}>
      <aside className={adminStyles.panel}>
        {persona && (
          <div className={styles.blockers} style={{ marginBottom: "var(--space-4)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- färdig JPEG från utskicket */}
            <img className={styles.hero} src={persona.url} alt={`AI-genererad person åt ${lead.companyName}`} />
            <PersonaReview assetId={persona.id} review={persona.review} />
          </div>
        )}
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- färdig JPEG från utskicket
          <img className={styles.hero} src={heroUrl} alt={`Skylten till ${lead.companyName}`} />
        )}
        <dl className={adminStyles.facts} style={{ marginTop: "var(--space-4)" }}>
          <dt>Kontakt</dt>
          <dd>{lead.contactName ?? "—"}</dd>
          <dt>E-post</dt>
          <dd>{lead.email}</dd>
          <dt>Ort</dt>
          <dd>{lead.city ?? "—"}</dd>
          <dt>Segment</dt>
          <dd>{RELATION_SEGMENT_LABELS[relationSegment(lead)]}</dd>
          <dt>Våg</dt>
          <dd>{lead.wave ? WAVE_LABEL[lead.wave] : "—"}</dd>
          <dt>Status</dt>
          <dd>{LEAD_STATUS_LABEL[lead.status]}</dd>
          {lead.stopReason && (
            <>
              <dt>Stoppad</dt>
              <dd>{lead.stopReason}</dd>
            </>
          )}
          <dt>Butik</dt>
          <dd>{lead.shopSlug ? <a className={adminStyles.link} href={`/admin/butiker/${lead.shopSlug}`}>{lead.shopSlug}</a> : "—"}</dd>
          <dt>Landade</dt>
          <dd>{when(lead.landedAt)}</dd>
          <dt>Öppnade butiken</dt>
          <dd>{when(lead.demoOpenedAt)}</dd>
          <dt>Aktiverade</dt>
          <dd>{when(lead.attributedAt)}</dd>
          {lead.checkReason && (
            <>
              <dt>Kontroll</dt>
              <dd>{lead.checkReason}</dd>
            </>
          )}
        </dl>

        <h2 className={adminStyles.sectionTitle} style={{ marginTop: "var(--space-5)" }}>
          Före riktigt utskick
        </h2>
        {blockers.length ? (
          <ul className={styles.blockers}>
            {blockers.map((b) => (
              <li key={b}>
                <span className={styles.tag} data-tone="warn">
                  {b}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={adminStyles.success}>Inget hindrar ett utskick.</p>
        )}

        <div className={styles.controlRow} style={{ marginTop: "var(--space-5)" }}>
          {landingUrl && (
            <a className="btn btn--ghost" href={landingUrl} target="_blank" rel="noreferrer">
              Öppna landningssidan
            </a>
          )}
          {active && <StopLeadButton leadId={lead.id} />}
        </div>
      </aside>

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={adminStyles.empty}>
            <strong>Inga steg än</strong>
            <span>Godkänn leadet i listan så skapas mejlen.</span>
          </div>
        ) : (
          messages.map((m) => (
            <section key={m.id} aria-label={`Steg ${m.step}`}>
              <div className={adminStyles.sectionHead}>
                <h2 className={adminStyles.sectionTitle}>Steg {m.step}</h2>
                <span className={styles.tag}>
                  {MESSAGE_STATUS_LABEL[m.status]}
                  {m.sentAt ? ` · ${when(m.sentAt)}` : ""}
                </span>
              </div>
              {(m.lastError || m.cancelReason) && <p className={adminStyles.muted}>{m.lastError ?? m.cancelReason}</p>}
              <iframe
                className={styles.preview}
                sandbox=""
                src={`/api/admin/outreach/preview/${m.id}`}
                title={`Förhandsvisning steg ${m.step}`}
                loading="lazy"
              />
            </section>
          ))
        )}
      </div>
    </div>
  );
}
