import "server-only";
import { emailMode } from "@/lib/email";
import { noticeEmailSettings } from "@/lib/notices/email";
import { paymentsConfigured } from "@/lib/payments/stripe";
import { supplierApiConfigured } from "@/lib/supplier/client";
import { dispatchRetryOverview } from "@/lib/supplier/retry";
import type { RetryOverview } from "@/lib/supplier/retry-rules";
import { listServerErrors } from "./error-log";
import { JOBS } from "./jobs";
import { nextRunAt, type JobRun, type LoggedError } from "./model";
import { jobRuns, schedulerEnabled } from "./scheduler";

/** En strömbrytare i driften. Bara av eller på: värdet på en nyckel visas aldrig. */
interface OpsSwitch {
  label: string;
  on: boolean;
  text: string;
}

export interface OpsJob {
  name: string;
  label: string;
  everyMs: number;
  last: JobRun | null;
  nextAt: string | null;
}

export interface OpsStatus {
  switches: OpsSwitch[];
  /** Falskt när schemat inte körs i den här miljön. */
  scheduler: boolean;
  jobs: OpsJob[];
  /** Ordrar vars utskick till verkstaden har misslyckats. */
  retry: RetryOverview;
  connected: boolean;
  errors: LoggedError[];
  errorTotal: number;
}

/** Så många fel visas på driftsidan. Resten ligger kvar i loggen tills den rensas. */
const ERRORS_SHOWN = 100;

/** Allt driftsidan visar: strömbrytarna, jobben, misslyckade utskick och de senaste felen. */
export async function getOpsStatus(): Promise<OpsStatus> {
  const connected = supplierApiConfigured();
  const mail = emailMode() === "live";
  const noticeMail = noticeEmailSettings() !== null;
  const cardPayments = paymentsConfigured();
  const [runs, retry, logged] = await Promise.all([jobRuns(), dispatchRetryOverview(), listServerErrors(ERRORS_SHOWN)]);
  return {
    switches: [
      {
        label: "Kopplingen till verkstaden",
        on: connected,
        text: connected
          ? "Nya ordrar skickas till Skylt & Gravyrteknik när de läggs."
          : "Ordrar sparas och väntar. Ingenting skickas till verkstaden.",
      },
      {
        label: "Mejl",
        on: mail,
        text: mail ? "Resend är inkopplat." : "Inget mejl lämnar servern.",
      },
      {
        label: "Besked som mejl",
        on: noticeMail,
        text: noticeMail
          ? "Besked, orderbekräftelser, fraktbesked och länkar för nytt lösenord går som mejl."
          : "Besked syns bara i panelen. Kunden får inga mejl.",
      },
      {
        label: "Kortbetalning",
        on: cardPayments,
        text: cardPayments ? "Privatpersoner betalar med kort i kassan." : "Bara företag kan beställa, på faktura.",
      },
    ],
    scheduler: schedulerEnabled(),
    jobs: JOBS.map((job) => {
      const last = runs[job.name] ?? null;
      return { name: job.name, label: job.label, everyMs: job.everyMs, last, nextAt: nextRunAt(job, last ?? undefined)?.toISOString() ?? null };
    }),
    retry,
    connected,
    errors: logged.errors,
    errorTotal: logged.total,
  };
}
