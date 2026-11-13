import { requireDb } from "../src/lib/db/client";
import { runOutreachTickNow } from "../src/lib/outreach/run-tick";

/**
 * Kör en tick lokalt med samma spärrar som cron. Utan RESEND_API_KEY blir
 * det alltid dry-run: mejlen hamnar i OUTREACH_OUTBOX_DIR.
 *   pnpm outreach:tick
 */

async function main() {
  const result = await runOutreachTickNow("script");
  const { items, ...summary } = result;
  console.warn(JSON.stringify(summary));
  for (const item of items) {
    console.warn(
      [item.outcome, `steg ${item.step}`, item.messageId, item.blockers?.join(",") ?? "", item.error ?? ""].filter(Boolean).join("  "),
    );
  }
  await requireDb().end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
