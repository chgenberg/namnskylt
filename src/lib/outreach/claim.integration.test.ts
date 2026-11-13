import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres, { type Sql } from "postgres";
import { DEFAULT_CAMPAIGN_STEPS } from "./model";
import {
  claimLeadShop,
  claimNextReady,
  ensureMessages,
  getLead,
  getMessage,
  listReady,
  reclaimStale,
  releaseClaim,
  shopForSource,
  stopLead,
  suppress,
  upsertCampaign,
  upsertLeads,
  type CampaignRow,
} from "./store";

/** Körs bara mot en riktig databas med migreringen `013_outreach`. */
const url = process.env.DATABASE_URL;

describe("kön i databasen", { skip: !url }, () => {
  let sql: Sql;
  let campaign: CampaignRow;
  const run = randomUUID().slice(0, 8);
  const shopSlug = `claim-test-${run}`;
  const emails = Array.from({ length: 5 }, (_, i) => `claim-${run}-${i}@test.invalid`);
  const stopEmails = Array.from({ length: 4 }, (_, i) => `claim-${run}-stop-${i}@test.invalid`);

  before(async () => {
    sql = postgres(url ?? "", { max: 10, onnotice: () => undefined });
    campaign = await upsertCampaign(sql, {
      slug: `claim-test-${run}`,
      name: "Claim-test",
      fromName: "Test",
      fromEmail: "test@mail.namnskylt.com",
      replyTo: "test@namnskylt.com",
      signature: {},
      dailyCap: 40,
      steps: DEFAULT_CAMPAIGN_STEPS.map((s) => ({ ...s, enabled: true })),
    });
    await upsertLeads(
      sql,
      emails.map((email) => ({
        email,
        contactName: "Test Person",
        companyName: `Test ${run}`,
        phone: null,
        city: null,
        country: "se" as const,
        customerSince: null,
        activated: true,
        known: false,
        website: null,
        upShopUrl: null,
        wave: "internal" as const,
        checkReasons: [],
      })),
    );
    const ids = (await sql<{ id: string }[]>`select id from outreach_leads where email = any(${sql.array(emails)})`).map(
      (r) => r.id,
    );
    await sql`update outreach_leads set status = 'approved' where id = any(${sql.array(ids)}::uuid[])`;
    await ensureMessages(sql, campaign, ids);
  });

  /** Ett godkänt lead med steg 1 i `ready`; ger leadets id. */
  async function approvedLeadWithMessages(email: string | undefined): Promise<string> {
    assert.ok(email);
    await upsertLeads(sql, [
      {
        email,
        contactName: "Test Person",
        companyName: `Test ${run}`,
        phone: null,
        city: null,
        country: "se",
        customerSince: null,
        activated: true,
        known: false,
        website: null,
        upShopUrl: null,
        wave: "internal",
        checkReasons: [],
      },
    ]);
    const [row] = await sql<{ id: string }[]>`update outreach_leads set status = 'approved' where email = ${email} returning id`;
    assert.ok(row);
    await ensureMessages(sql, campaign, [row.id]);
    return row.id;
  }

  after(async () => {
    const allEmails = [...emails, ...stopEmails];
    await sql`delete from outreach_campaigns where id = ${campaign.id}`;
    await sql`delete from outreach_suppressions where email = any(${sql.array(allEmails)})`;
    await sql`delete from outreach_leads where email = any(${sql.array(allEmails)})`;
    await sql`delete from shops where slug = ${shopSlug}`;
    await sql.end();
  });

  test("åtta parallella claim mot fem rader ger fem unika och sedan inget", async () => {
    const now = new Date();
    const claims = await Promise.all(Array.from({ length: 8 }, () => claimNextReady(sql, campaign.id, now)));
    const ids = claims.flatMap((c) => (c ? [c.id] : []));
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    assert.equal(await claimNextReady(sql, campaign.id, now), null);
  });

  test("en ny import skriver inte över ett lead som är i sekvens", async () => {
    const [email] = emails;
    assert.ok(email);
    const result = await upsertLeads(sql, [
      {
        email,
        contactName: "Annat Namn",
        companyName: "Annat",
        phone: null,
        city: null,
        country: "se",
        customerSince: null,
        activated: false,
        known: false,
        website: null,
        upShopUrl: null,
        wave: "C",
        checkReasons: [],
      },
    ]);
    assert.equal(result.untouched, 1);
    const [row] = await sql<{ id: string }[]>`select id from outreach_leads where email = ${email}`;
    const lead = row && (await getLead(sql, row.id));
    assert.equal(lead?.companyName, `Test ${run}`);
    assert.equal(lead?.status, "in_sequence");
  });

  test("en spärr avbokar resten av leadets sekvens", async () => {
    const email = emails[1];
    assert.ok(email);
    await suppress(sql, { email, reason: "unsubscribe", source: "link" });
    const rows = await sql<{ status: string }[]>`
      select m.status from outreach_messages m join outreach_leads l on l.id = m.lead_id
       where l.email = ${email} and m.step = 2`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "cancelled");
  });

  test("en rad som fastnat i sending för ett stoppat lead går inte tillbaka till kön", async () => {
    const leadId = await approvedLeadWithMessages(stopEmails[0]);
    const claimed = await claimNextReady(sql, campaign.id, new Date());
    assert.ok(claimed);
    assert.equal(claimed.leadId, leadId);
    await stopLead(sql, leadId, "landed");
    await sql`update outreach_messages set claimed_at = now() - interval '30 minutes' where id = ${claimed.id}`;

    await reclaimStale(sql, new Date());

    assert.equal((await getMessage(sql, claimed.id))?.status, "needs_review");
    assert.equal(await claimNextReady(sql, campaign.id, new Date()), null);
  });

  test("en rad i ready för ett stoppat lead tas inte i anspråk", async () => {
    const leadId = await approvedLeadWithMessages(stopEmails[1]);
    const claimed = await claimNextReady(sql, campaign.id, new Date());
    assert.ok(claimed);
    assert.equal(claimed.leadId, leadId);
    // Leadet stoppas medan ticket håller raden, och ticket lämnar sedan tillbaka den.
    await stopLead(sql, leadId, "replied");
    await releaseClaim(sql, claimed.id);

    assert.equal(await claimNextReady(sql, campaign.id, new Date()), null);
  });

  test("torrkörningens lista visar inte ett stoppat lead", async () => {
    const stoppedLead = await approvedLeadWithMessages(stopEmails[2]);
    const claimed = await claimNextReady(sql, campaign.id, new Date());
    assert.ok(claimed);
    assert.equal(claimed.leadId, stoppedLead);
    await stopLead(sql, stoppedLead, "activated");
    await releaseClaim(sql, claimed.id);
    const activeLead = await approvedLeadWithMessages(stopEmails[3]);

    const listed = await listReady(sql, campaign.id, new Date(), 50);

    assert.ok(listed.some((m) => m.leadId === activeLead));
    assert.ok(!listed.some((m) => m.leadId === stoppedLead));
  });

  test("två kontakter på samma företag kan inte ta samma butik", async () => {
    await sql`insert into shops (slug, data) values (${shopSlug}, ${sql.json({ sourceUrl: `claim-${run}.test/sv-se` })})`;
    const ids = (
      await sql<{ id: string }[]>`select id from outreach_leads where email = any(${sql.array(emails.slice(2, 4))})`
    ).map((r) => r.id);
    const claims = await Promise.all(ids.map((id) => claimLeadShop(sql, id, shopSlug)));
    assert.deepEqual([...claims].sort(), [false, true]);
    const winner = ids[claims.indexOf(true)];
    assert.ok(winner);
    assert.equal(await claimLeadShop(sql, winner, shopSlug), true);
  });

  test("butiken hittas på värdnamnet även när adressen har en sökväg", async () => {
    assert.equal((await shopForSource(sql, `claim-${run}.test`))?.slug, shopSlug);
    assert.equal(await shopForSource(sql, `annan-${run}.test`), null);
  });
});
