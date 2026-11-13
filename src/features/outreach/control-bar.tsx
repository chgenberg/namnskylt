"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { ControlMode } from "@/lib/outreach/model";
import type { TickResult } from "@/lib/outreach/tick";
import { runTickAction, setCampaignActiveAction, setControlAction } from "./actions";
import { TICK_OUTCOME_LABEL, tickSummary } from "./labels";
import adminStyles from "@/features/admin/admin.module.css";
import styles from "./outreach.module.css";

interface ControlBarProps {
  paused: boolean;
  mode: ControlMode;
  /** RESEND_API_KEY finns och nödstoppet är av. */
  liveAvailable: boolean;
  campaignActive: boolean;
  campaignPausedReason: string | null;
  lastTick: { at: string; summary: string } | null;
  /** Senaste ticken inne i fönstret är äldre än 15 minuter. */
  cronStale: boolean;
}

export function ControlBar(props: ControlBarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState<TickResult | null>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string } | void>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.error ?? "Det gick inte");
      router.refresh();
    });
  };

  const runTick = () => {
    setError(null);
    startTransition(async () => {
      try {
        setTick(await runTickAction());
      } catch {
        setError("Ticken kunde inte köras");
      }
      router.refresh();
    });
  };

  const sending = !props.paused && props.campaignActive;

  return (
    <section className={`${adminStyles.panel} ${styles.controlBar}`} aria-label="Styrning">
      <div className={styles.controlRow}>
        <span className={styles.state} data-tone={sending ? "go" : "stop"}>
          {sending ? (props.mode === "live" ? "Skickar på riktigt" : "Kör dry-run") : "Stoppat"}
        </span>
        <span className={styles.spacer} />
        <button type="button" className="btn btn--primary" disabled={pending} onClick={runTick}>
          {pending ? "Kör…" : "Kör ett tick"}
        </button>
      </div>

      <div className={styles.controlRow}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Utskick</span>
          <Segmented
            label="Utskick"
            value={props.paused ? "paused" : "running"}
            options={[
              { id: "paused", label: "Pausat" },
              { id: "running", label: "Igång" },
            ]}
            onChange={(value) => run(() => setControlAction({ paused: value === "paused" }))}
          />
        </div>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Läge</span>
          <Segmented
            label="Läge"
            value={props.mode}
            options={[
              { id: "dry_run", label: "Dry-run" },
              {
                id: "live",
                label: "Live",
                title: props.liveAvailable ? "Skicka riktiga mejl" : "Kräver RESEND_API_KEY",
              },
            ]}
            onChange={(value) => {
              if (value === "live" && !props.liveAvailable) {
                setError("Live kräver RESEND_API_KEY — sätts upp i fas 1");
                return;
              }
              run(() => setControlAction({ mode: value }));
            }}
          />
        </div>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Kampanj</span>
          <Segmented
            label="Kampanj"
            value={props.campaignActive ? "active" : "paused"}
            options={[
              { id: "paused", label: "Vilande" },
              { id: "active", label: "Aktiv" },
            ]}
            onChange={(value) => run(() => setCampaignActiveAction(value === "active"))}
          />
        </div>
      </div>

      {props.campaignPausedReason && !props.campaignActive && (
        <p className={styles.warning}>Kampanjen pausades: {props.campaignPausedReason}</p>
      )}
      {props.cronStale && (
        <p className={styles.warning}>Ingen tick på över 15 minuter inne i sändfönstret — kontrollera cron.</p>
      )}
      {error && (
        <p className={adminStyles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.tickResult} aria-live="polite">
        {tick ? (
          <>
            <strong>{tickSummary(tick)}</strong>
            {tick.items.length > 0 && (
              <ul className={styles.tickItems}>
                {tick.items.map((item) => (
                  <li key={item.messageId}>
                    {TICK_OUTCOME_LABEL[item.outcome]} · steg {item.step}
                    {item.subject ? ` · ${item.subject}` : ""}
                    {item.blockers?.length ? ` · ${item.blockers.join(", ")}` : ""}
                    {item.error ? ` · ${item.error}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          props.lastTick && (
            <span className={adminStyles.muted}>
              Senaste tick {props.lastTick.at}: {props.lastTick.summary}
            </span>
          )
        )}
      </div>
    </section>
  );
}
