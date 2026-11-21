import "server-only";
import { emailMode } from "@/lib/email";
import { adminNoticeEmailSettings, noticeEmailSettings } from "@/lib/notices/email";
import { paymentsConfigured } from "@/lib/payments/stripe";
import { quoteEmailOn } from "@/lib/quotes/send";
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
  const quoteMail = quoteEmailOn();
  const adminMail = adminNoticeEmailSettings();
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
        label: "Offertmejl",
        on: quoteMail,
        text: quoteMail
          ? "En offert mejlas till kunden när den skickas, via Skylt & Gravyrtekniks Resend."
          : "Offerter mejlas inte härifrån. Säljaren skickar länken själv.",
      },
      {
        label: "Adminens besked som mejl",
        on: adminMail !== null,
        text: adminMail
          ? `Besked till namnskylt.coms panel, som en ny ansökan från en återförsäljare, mejlas till ${adminMail.recipients.length === 1 ? "en adress" : `${adminMail.recipients.length} adresser`}.`
          : "Adminens besked syns bara i panelen.",
      },
      {
        label: "Utskicket till återförsäljare",
        on: mail,
        text: mail ? "Resend är inkopplat för utskicket." : "Utskicket skickar inga mejl.",
      },
      {
        label: "Mejl till återförsäljare och butikskunder",
        on: noticeMail,
        text: noticeMail
          ? "Återförsäljarnas besked och länken för nytt lösenord går som mejl, och en kund som beställer i en återförsäljares butik får orderbekräftelse och fraktbesked."
          : "Återförsäljarnas besked syns bara i panelen, och butikernas kunder får inga mejl.",
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
