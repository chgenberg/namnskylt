import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailStep } from "../src/lib/outreach/copy";
import { RELATION_SEGMENT_LABELS, RELATION_SEGMENTS, type RelationSegment } from "../src/lib/outreach/model";
import { buildResellerEmail, type ResellerEmail } from "../src/lib/outreach/reseller-email";
import { OUTREACH_HERO } from "../src/lib/outreach/hero";
import { WORKSHOP_COMPANY } from "../src/lib/company/workshop";

/**
 * Skriver alla segment × steg till tmp/outreach-preview/ från påhittade
 * kunder — utan databas och utan nät. Öppna index.html, eller en .eml i
 * Apple Mail eller Outlook för att se mejlet som mottagaren ser det.
 * Mejlet har ingen bild sedan 2026-11-25: en knapp som ringer Pär och en länk till filmen.
 */

const OUT_DIR = path.join(process.cwd(), "tmp", "outreach-preview");
const SITE = "https://www.namnskylt.com";
const STEPS: EmailStep[] = [1, 2];

const FIXTURES: Record<RelationSegment, { contactName: string | null; company: string; since: number }> = {
  "activated-known": { contactName: "Anna Lindqvist", company: "Exempelprofil AB", since: 2019 },
  "activated-unknown": { contactName: "Erik Sund", company: "Reklamhuset i Norr", since: 2021 },
  "inactive-known": { contactName: "Maria Holm", company: "Holm & Co Profil", since: 2016 },
  "inactive-unknown": { contactName: null, company: "Tryckeriet Väst", since: 2023 },
};

// Besluten 2026-11-25: Skylt & Gravyrteknik står bakom, avsändarnamnet är Namnskylt, svar går till
// info@skyltochgravyr.com, och mejlet signeras av gänget med hej@namnskylt.com.
const SENDER = {
  legalName: WORKSHOP_COMPANY.legalName,
  orgNumber: WORKSHOP_COMPANY.orgNumber,
  address: `${WORKSHOP_COMPANY.street}, ${WORKSHOP_COMPANY.zipCity}`,
};
const SIGNATURE = { name: "Gänget på Namnskylt", email: "hej@namnskylt.com" };
const FROM = "Namnskylt <info@utskick.skyltochgravyr.com>";
const REPLY_TO = "hej@namnskylt.com";


function base64Lines(data: Buffer | string): string {
  return (Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")).toString("base64").replace(/.{76}/g, "$&\r\n");
}

const encodedWord = (value: string) => `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

function eml(email: ResellerEmail, to: string): string {
  const html = email.html;
  const rel = "rel-boundary";
  const alt = "alt-boundary";
  return [
    `From: ${encodedWord("Namnskylt")} <${FROM.replace(/^.*<|>$/g, "")}>`,
    `Reply-To: ${REPLY_TO}`,
    `To: ${to}`,
    `Subject: ${encodedWord(email.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    ...Object.entries(email.headers).map(([k, v]) => `${k}: ${v}`),
    `Content-Type: multipart/related; boundary="${rel}"`,
    "",
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.text),
    `--${alt}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(html),
    `--${alt}--`,
    `--${rel}--`,
    "",
  ].join("\r\n");
}


async function main() {
  await mkdir(path.join(OUT_DIR, "img"), { recursive: true });
  // Toppbilden läses från public/ här; i ett riktigt mejl hämtas den från sajten.
  await copyFile(path.join(process.cwd(), "public", OUTREACH_HERO.src), path.join(OUT_DIR, "img", "topp.jpg"));
  const index: string[] = [];

  for (const segment of RELATION_SEGMENTS) {
    const fixture = FIXTURES[segment];
    for (const step of STEPS) {
      const result = buildResellerEmail({
        step,
        segment,
        locale: "sv",
        contactName: fixture.contactName,
        company: fixture.company,
        customerSinceYear: fixture.since,
        filmUrl: `${SITE}/demo?k=forhandsvisning`,
        heroImage: { ...OUTREACH_HERO, url: "img/topp.jpg" },
        unsubscribeUrl: `${SITE}/avregistrera/forhandsvisning`,
        privacyUrl: `${SITE}/integritet`,
        sender: SENDER,
        signature: SIGNATURE,
      });
      if (!result.ok) throw new Error(`${segment} steg ${step}: saknar ${result.missing.join(", ")}`);
      const name = `${segment}-${step}`;
      await writeFile(path.join(OUT_DIR, `${name}.html`), result.email.html);
      await writeFile(path.join(OUT_DIR, `${name}.eml`), eml(result.email, "mottagare@example.com"));
      await writeFile(path.join(OUT_DIR, `${name}.txt`), result.email.text);
      index.push(
        `<section><h2>${RELATION_SEGMENT_LABELS[segment]} · steg ${step}</h2><p><b>Från:</b> ${FROM.replace(/</g, "&lt;")}<br><b>Svar till:</b> ${REPLY_TO}<br><b>Ämne:</b> ${result.email.subject}<br><b>Förhandstext:</b> ${result.email.preheader}</p><p><a href="${name}.html">HTML</a> · <a href="${name}.eml">.eml</a> · <a href="${name}.txt">text</a></p><iframe src="${name}.html" loading="lazy"></iframe></section>`,
      );
    }
  }

  await writeFile(
    path.join(OUT_DIR, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Återförsäljarmejlet</title><style>body{font-family:system-ui;margin:32px;background:#eee}section{margin:0 0 40px}iframe{width:680px;height:1500px;border:0;background:#fff;border-radius:12px}</style><h1>Återförsäljarmejlet — ${RELATION_SEGMENTS.length * STEPS.length} varianter</h1>${index.join("")}`,
  );
  console.warn(`Skrev ${index.length} mejl till ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
