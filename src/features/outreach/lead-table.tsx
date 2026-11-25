"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import adminStyles from "@/features/admin/admin.module.css";
import { WAVES, type AssetReview, type LeadStatus, type MessageStatus, type Wave } from "@/lib/outreach/model";
import { approveLeadsAction, setWaveAction } from "./actions";
import { LEAD_STATUS_LABEL, MESSAGE_STATUS_LABEL, WAVE_LABEL } from "./labels";
import styles from "./outreach.module.css";

export interface LeadTableRow {
  id: string;
  company: string;
  contact: string | null;
  city: string | null;
  country: string;
  wave: Wave | null;
  segment: string;
  status: LeadStatus;
  checkReason: string | null;
  heroReady: boolean;
  /** Personbildens granskning; `null` = ingen personbild. Bara en godkänd följer med i mejlet. */
  persona: AssetReview | null;
  messageStatus: MessageStatus | null;
  /** Mottagaren klickade till sidan med filmen. */
  landed: boolean;
  /** Mottagaren bad om att bli uppringd. */
  callback: boolean;
}

export function LeadTable({ rows }: { rows: LeadTableRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [wave, setWave] = useState<Wave | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const approve = () =>
    startTransition(async () => {
      const result = await approveLeadsAction([...selected]);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const refused = result.refused.length
        ? ` ${result.refused.length} gick inte: ${[...new Set(result.refused.flatMap((r) => r.reasons))].join("; ")}.`
        : "";
      setMessage(`${result.approved} godkända.${refused}`);
      setSelected(new Set());
      router.refresh();
    });

  const applyWave = () =>
    startTransition(async () => {
      await setWaveAction([...selected], wave || null);
      setMessage(`Våg satt för ${selected.size}.`);
      router.refresh();
    });

  if (rows.length === 0) {
    return (
      <div className={adminStyles.empty}>
        <strong>Inga leads matchar</strong>
        <span>Ändra filtret, eller importera listan med pnpm outreach:import.</span>
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <div className={styles.selectionBar} role="region" aria-label="Markerade">
          <span>{selected.size} markerade</span>
          <button type="button" className="btn btn--primary" disabled={pending} onClick={approve}>
            Godkänn
          </button>
          <label className={styles.controlRow}>
            <span className="visually-hidden">Våg</span>
            <select className={adminStyles.select} value={wave} onChange={(e) => setWave(e.target.value as Wave | "")}>
              <option value="">Ingen våg</option>
              {WAVES.map((w) => (
                <option key={w} value={w}>
                  Våg {WAVE_LABEL[w]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn--ghost" disabled={pending} onClick={applyWave}>
              Sätt våg
            </button>
          </label>
          <button type="button" className="btn btn--ghost" onClick={() => setSelected(new Set())}>
            Avmarkera
          </button>
        </div>
      )}
      {message && (
        <p className={adminStyles.muted} role="status">
          {message}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input type="checkbox" aria-label="Markera alla" checked={allSelected} onChange={toggleAll} />
              </th>
              <th>Företag</th>
              <th>Kontakt</th>
              <th>Våg</th>
              <th>Segment</th>
              <th>Status</th>
              <th>Senaste steg</th>
              <th>Bild</th>
              <th>Kontroll</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-selected={selected.has(row.id)}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Markera ${row.company}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </td>
                <td>
                  <Link className={adminStyles.link} href={`/admin/utskick/${row.id}`}>
                    {row.company}
                  </Link>
                  {row.country !== "se" && <span className={styles.tag}> {row.country.toUpperCase()}</span>}
                </td>
                <td>{row.contact ?? "—"}</td>
                <td>{row.wave ? WAVE_LABEL[row.wave] : "—"}</td>
                <td>{row.segment}</td>
                <td>
                  <span className={styles.tag} data-tone={row.status === "blocked" || row.status === "suppressed" ? "warn" : undefined}>
                    {LEAD_STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td>
                  {row.callback ? (
                    <span className={styles.tag} data-tone="ok">Vill bli uppringd</span>
                  ) : row.landed ? (
                    <span className={styles.tag} data-tone="ok">Klickade</span>
                  ) : row.messageStatus ? (
                    MESSAGE_STATUS_LABEL[row.messageStatus]
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {row.persona === "approved" ? (
                    <span className={styles.tag} data-tone="ok">Person</span>
                  ) : row.persona === "pending" ? (
                    <span className={styles.tag} data-tone="warn">Att granska</span>
                  ) : row.heroReady ? (
                    <span className={styles.tag}>Bara skylt</span>
                  ) : (
                    <span className={styles.tag} data-tone="warn">Saknas</span>
                  )}
                </td>
                <td>{row.checkReason ? <span className={styles.tag} data-tone="warn">{row.checkReason}</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
