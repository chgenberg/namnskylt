import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadNodeFontEngine } from "../src/lib/fonts/load-node";
import { badgeCaption, badgeForLead, heroJpeg } from "../src/lib/outreach/badge-asset";
import type { EmailStep } from "../src/lib/outreach/copy";
import { RELATION_SEGMENT_LABELS, RELATION_SEGMENTS, type RelationSegment } from "../src/lib/outreach/model";
import { personaJpeg } from "../src/lib/outreach/persona-image";
import { buildResellerEmail, type ResellerEmail } from "../src/lib/outreach/reseller-email";

/**
 * Skriver alla segment × steg till tmp/outreach-preview/ från påhittade
 * kunder — utan databas och utan nät. Öppna index.html, eller en .eml i
 * Apple Mail eller Outlook för att se mejlet som mottagaren ser det.
 */

const OUT_DIR = path.join(process.cwd(), "tmp", "outreach-preview");
const SITE = "https://namnskylt.com";
const STEPS: EmailStep[] = [1, 2];

const FIXTURES: Record<RelationSegment, { contactName: string | null; company: string; colors: string[]; since: number }> = {
  "activated-known": { contactName: "Anna Lindqvist", company: "Profilab AB", colors: ["#003366"], since: 2019 },
  "activated-unknown": { contactName: "Erik Sund", company: "Reklamhuset i Norr", colors: ["#e31c23"], since: 2021 },
  "inactive-known": { contactName: "Maria Holm", company: "Holm & Co Profil", colors: ["#006b2e"], since: 2016 },
  "inactive-unknown": { contactName: null, company: "Tryckeriet Väst", colors: [], since: 2023 },
};

const SENDER = { legalName: "[Juridiskt namn AB]", orgNumber: "[556000-0000]", address: "[Gatuadress 1, 111 22 Ort]" };
const SIGNATURE = { name: "[Namn Efternamn]", title: "[Titel]", phone: "[070-000 00 00]", email: "[namn@namnskylt.com]" };

function base64Lines(data: Buffer | string): string {
  return (Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")).toString("base64").replace(/.{76}/g, "$&\r\n");
}

const encodedWord = (value: string) => `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

function eml(email: ResellerEmail, to: string, images: { cid: string; file: string; bytes: Buffer }[]): string {
  let html = email.html;
  for (const image of images) html = html.split(`img/${image.file}`).join(`cid:${image.cid}`);
  const rel = "rel-boundary";
  const alt = "alt-boundary";
  return [
    `From: ${encodedWord(SIGNATURE.name)} <hej@mail.namnskylt.com>`,
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
    ...images.flatMap((image) => [
      `--${rel}`,
      `Content-Type: image/${image.file.endsWith(".png") ? "png" : "jpeg"}`,
      `Content-ID: <${image.cid}>`,
      `Content-Disposition: inline; filename="${image.file}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(image.bytes),
    ]),
    `--${rel}--`,
    "",
  ].join("\r\n");
}

/** `--persona bild.jpg` visar personvarianten med en egen bild; annars bara skylten. */
function personaArg(): string | null {
  const i = process.argv.indexOf("--persona");
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  await mkdir(path.join(OUT_DIR, "img"), { recursive: true });
  const fonts = await loadNodeFontEngine();
  const personaPath = personaArg();
  const persona = personaPath ? await personaJpeg(await readFile(personaPath)) : null;
  if (persona) await writeFile(path.join(OUT_DIR, "img", "persona.jpg"), persona.bytes);
  const index: string[] = [];

  for (const segment of RELATION_SEGMENTS) {
    const fixture = FIXTURES[segment];
    const lead = { contactName: fixture.contactName, companyName: fixture.company, brandColors: fixture.colors };
    const hero = badgeForLead(lead, null);
    const heroImage = await heroJpeg(hero.doc, fonts);
    await writeFile(path.join(OUT_DIR, "img", `${segment}-hero.jpg`), heroImage.bytes);
    const images = persona
      ? [{ cid: "persona@preview", file: "persona.jpg", bytes: persona.bytes }]
      : [{ cid: `hero-${segment}@preview`, file: `${segment}-hero.jpg`, bytes: heroImage.bytes }];
    const image = persona
      ? { url: "img/persona.jpg", width: persona.width, height: persona.height, kind: "persona" as const }
      : { url: `img/${segment}-hero.jpg`, width: heroImage.width, height: heroImage.height, kind: "badge" as const };

    for (const step of STEPS) {
      const result = buildResellerEmail({
        step,
        segment,
        locale: "sv",
        contactName: fixture.contactName,
        company: fixture.company,
        customerSinceYear: fixture.since,
        landingUrl: `${SITE}/for/forhandsvisning`,
        unsubscribeUrl: `${SITE}/avregistrera/forhandsvisning`,
        privacyUrl: `${SITE}/integritet`,
        image: { ...image, badgeCaption: badgeCaption({ ...hero.doc, ...hero.doc.size }), hasLogo: persona ? true : hero.logoStatus === "logo" },
        sender: SENDER,
        signature: SIGNATURE,
      });
      if (!result.ok) throw new Error(`${segment} steg ${step}: saknar ${result.missing.join(", ")}`);
      const name = `${segment}-${step}`;
      await writeFile(path.join(OUT_DIR, `${name}.html`), result.email.html);
      await writeFile(path.join(OUT_DIR, `${name}.eml`), eml(result.email, "mottagare@example.com", images));
      await writeFile(path.join(OUT_DIR, `${name}.txt`), result.email.text);
      index.push(
        `<section><h2>${RELATION_SEGMENT_LABELS[segment]} · steg ${step}</h2><p><b>Ämne:</b> ${result.email.subject}<br><b>Förhandstext:</b> ${result.email.preheader}</p><p><a href="${name}.html">HTML</a> · <a href="${name}.eml">.eml</a> · <a href="${name}.txt">text</a></p><iframe src="${name}.html" loading="lazy"></iframe></section>`,
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
