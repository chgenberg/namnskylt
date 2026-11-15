import "server-only";
import { pruneDesignerEvents } from "@/lib/designer-stats/repository";
import { deleteUnusedLogoFiles } from "@/lib/logo-images/cleanup";
import { pruneUnpaidCheckouts } from "@/lib/payments/checkout";
import { retryFailedDispatches, retryNote } from "@/lib/supplier/retry";
import { pruneErrorLog } from "./error-log";
import type { Job } from "./model";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Bakgrundsjobben som schemat kör (`startScheduler`). Ett nytt jobb läggs till
 * här: ett fast `name`, en rad för driftsidan, hur ofta det körs och arbetet.
 * Det `run` svarar med visas som en kort rad på driftsidan. Varje jobb körs
 * under ett eget lås, så det går aldrig två gånger samtidigt.
 */
export const JOBS: readonly Job[] = [
  {
    name: "dispatch-retry",
    label: "Nytt försök att skicka ordrar till verkstaden",
    everyMs: 10 * MINUTE_MS,
    run: async () => retryNote(await retryFailedDispatches()),
  },
  {
    name: "error-log-prune",
    label: "Rensning av felloggen",
    everyMs: DAY_MS,
    run: async () => `${await pruneErrorLog()} rader borttagna`,
  },
  {
    name: "checkout-prune",
    label: "Rensning av kassor som aldrig betalades",
    everyMs: DAY_MS,
    run: async () => `${await pruneUnpaidCheckouts()} kassor borttagna`,
  },
  {
    name: "designer-events-prune",
    label: "Rensning av skyltmotorns statistik äldre än ett halvår",
    everyMs: DAY_MS,
    run: async () => `${await pruneDesignerEvents()} rader borttagna`,
  },
  {
    name: "logo-cleanup",
    label: "Rensning av loggor som ingen skylt använder",
    everyMs: DAY_MS,
    run: async () => {
      const removed = await deleteUnusedLogoFiles();
      return `${removed.images} bilder och ${removed.originals} originalfiler borttagna`;
    },
  },
];
