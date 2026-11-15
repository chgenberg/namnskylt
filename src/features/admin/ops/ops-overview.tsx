import "server-only";
import { formatDate } from "@/lib/format";
import type { OpsJob, OpsStatus } from "@/lib/maintenance/status";
import { ClearErrorsButton } from "./clear-errors-button";
import admin from "../admin.module.css";
import table from "../reseller-orders.module.css";
import styles from "./ops.module.css";

const MINUTE_MS = 60_000;

/** "var 10:e minut", "en gång i timmen", "en gång per dygn". */
function everyLabel(everyMs: number): string {
  const minutes = Math.round(everyMs / MINUTE_MS);
  if (minutes < 60) return minutes === 1 ? "varje minut" : `var ${minutes}:e minut`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "en gång i timmen" : `var ${hours}:e timme`;
  const days = Math.round(hours / 24);
  return days === 1 ? "en gång per dygn" : `var ${days}:e dygn`;
}

function retryHint(status: OpsStatus): string {
  const { failed, willRetry, nextAt } = status.retry;
  if (failed === 0) return "inga ordrar har fastnat";
  if (!status.connected) return "kopplingen är av, inget provas om";
  if (willRetry === 0 || !nextAt) return "provas inte om av sig själva, skicka dem under Tillverkning";
  const rest = failed - willRetry;
  return `nästa försök ${formatDate(nextAt)}${rest > 0 ? `, ${rest} provas inte om` : ""}`;
}

function JobRow({ job }: { job: OpsJob }) {
  return (
    <tr>
      <th scope="row" className={table.wrap}>
        {job.label}
        <span className={table.sub}>{everyLabel(job.everyMs)}</span>
      </th>
      <td>{job.last ? formatDate(job.last.startedAt) : <span className={admin.muted}>Aldrig</span>}</td>
      <td className={table.wrap}>
        {job.last ? (
          <>
            <span className={styles.state} data-ok={job.last.ok}>
              {job.last.ok ? "Klart" : "Misslyckades"}
            </span>
            {job.last.note && <span className={table.sub}>{job.last.note}</span>}
          </>
        ) : (
          <span className={admin.muted}>Väntar på första körningen</span>
        )}
      </td>
      <td>{job.nextAt ? formatDate(job.nextAt) : <span className={admin.muted}>Snarast</span>}</td>
    </tr>
  );
}

/**
 * Driftsidan: vad som är av och på, bakgrundsjobbens senaste körning,
 * ordrar som inte nått verkstaden och de senaste felen på servern.
 * Serverkomponent. Bara admin får den, och aldrig värdet på en nyckel.
 */
export function OpsOverview({ status }: { status: OpsStatus }) {
  return (
    <>
      <div className={admin.kpis}>
        {status.switches.map((item) => (
          <div key={item.label} className={admin.kpi}>
            <span className={admin.kpiLabel}>{item.label}</span>
            <span className={styles.switch} data-on={item.on}>
              {item.on ? "På" : "Av"}
            </span>
            <span className={admin.kpiHint}>{item.text}</span>
          </div>
        ))}
        <div className={admin.kpi} data-tone={status.retry.failed > 0 ? "gold" : undefined}>
          <span className={admin.kpiLabel}>Utskick som misslyckats</span>
          <span className={admin.kpiValue}>{status.retry.failed}</span>
          <span className={admin.kpiHint}>{retryHint(status)}</span>
        </div>
      </div>

      <section className={`${admin.panel} ${admin.section}`} aria-labelledby="ops-jobs">
        <div className={admin.sectionHead}>
          <h2 id="ops-jobs" className={admin.sectionTitle}>
            Bakgrundsjobb
          </h2>
          <span className={admin.muted}>
            {status.scheduler ? "Servern tittar en gång i minuten och kör de jobb som det är dags för." : "Schemat körs inte i den här miljön."}
          </span>
        </div>
        <div className={table.scroll}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">Jobb</th>
                <th scope="col">Senast</th>
                <th scope="col">Utfall</th>
                <th scope="col">Nästa</th>
              </tr>
            </thead>
            <tbody>
              {status.jobs.map((job) => (
                <JobRow key={job.name} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${admin.panel} ${admin.section}`} aria-labelledby="ops-errors">
        <div className={admin.sectionHead}>
          <h2 id="ops-errors" className={admin.sectionTitle}>
            Fel på servern
          </h2>
          <span className={styles.headActions}>
            <span className={admin.muted}>
              {status.errorTotal === 0
                ? "Felen sparas i 30 dagar."
                : status.errorTotal > status.errors.length
                  ? `De ${status.errors.length} senaste av ${status.errorTotal}. Felen sparas i 30 dagar.`
                  : `${status.errorTotal} st. Felen sparas i 30 dagar.`}
            </span>
            {status.errorTotal > 0 && <ClearErrorsButton />}
          </span>
        </div>
        {status.errors.length === 0 ? (
          <div className={admin.empty}>
            <strong>Inga fel</strong>
            <span>När en sida eller ett jobb kastar ett fel syns det här.</span>
          </div>
        ) : (
          <div className={table.scroll}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">Tid</th>
                  <th scope="col">Källa</th>
                  <th scope="col">Rutt</th>
                  <th scope="col">Fel</th>
                </tr>
              </thead>
              <tbody>
                {status.errors.map((error) => (
                  <tr key={error.id}>
                    <th scope="row">{formatDate(error.at)}</th>
                    <td className="mono">{error.source}</td>
                    <td className="mono">{error.route ?? ""}</td>
                    <td className={table.wrap}>
                      {error.detail ? (
                        <details className={styles.detail}>
                          <summary>{error.message}</summary>
                          <pre>{error.detail}</pre>
                          {error.digest && <span className={table.sub}>Kod {error.digest}</span>}
                        </details>
                      ) : (
                        error.message
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
