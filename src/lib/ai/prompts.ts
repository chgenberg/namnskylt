import {
  engravedRows,
  getColor,
  getMaterial,
  getMounting,
  logoMarking,
  logoPrintInkOf,
  nameMarking,
  rowPrintInkOf,
  type BadgeDocument,
  type LogoPlacement,
  type BadgeShape,
  type MaterialFinish,
} from "@/engine";

/** Vad förnamnet på skylten oftast är i Sverige. `unknown` = könsneutralt eller inget namn. */
export type NameGender = "female" | "male" | "unknown";

/** Åldersgrupp utifrån när förnamnet var vanligt i Sverige, bland personer i arbetsför ålder. */
export type NameAge = "young" | "middle" | "older" | "unknown";

/** Den som namnet troligen tillhör. */
export interface Wearer {
  gender: NameGender;
  age: NameAge;
}

export const UNKNOWN_WEARER: Wearer = { gender: "unknown", age: "unknown" };

const SUBJECT: Record<NameGender, string> = {
  female: "a Swedish woman",
  male: "a Swedish man",
  unknown: "a Swedish person (a woman or a man)",
};

const AGE: Record<NameAge, string> = {
  young: "aged about 25",
  middle: "aged about 40",
  older: "aged about 60, with natural signs of age such as grey hair and fine lines",
  unknown: "aged about 35",
};

/** Personen som bär skylten, beskriven så att kön och ålder passar namnet. */
export function wearerDescription(wearer: Wearer): string {
  return `${SUBJECT[wearer.gender]} ${AGE[wearer.age]}, with a natural, believable appearance that suits the name on the badge`;
}

/** Första graverade raden — den som bär namnet om skylten har ett. */
export function badgeName(doc: BadgeDocument): string | null {
  return engravedRows(doc)[0]?.text.trim() || null;
}

/** Ytan, och hur en graverad text ser ut i den. Printad text beskrivs för sig, se `PRINTED_TEXT`. */
interface FinishDescription {
  surface: string;
  engraved: string;
}

const FINISH_DESCRIPTION: Record<MaterialFinish, FinishDescription> = {
  plastic: { surface: "two-layer engraving plastic with a smooth satin surface", engraved: "the text is engraved through the top layer" },
  aluminium: { surface: "brushed anodised aluminium with fine horizontal brush lines", engraved: "the text is engraved and filled" },
  steel: { surface: "brushed stainless steel", engraved: "the text is laser-marked" },
  brass: { surface: "polished solid brass with a fine metallic sheen", engraved: "the text is engraved and filled black" },
  acrylic: {
    surface: "matt transparent acrylic, about 3 mm thick, over a coloured backing that gives a soft shadow depth",
    engraved: "the text is printed",
  },
  epoxy: { surface: "printed badge under a clear, glossy domed epoxy enamel that catches the light", engraved: "the text is printed" },
};

/** Lackad metall har ingen borstning — beskrivs för sig oavsett materialets yta. */
const LACQUERED_DESCRIPTION: FinishDescription = {
  surface: "thin metal with a smooth, matt lacquered surface and no brush lines",
  engraved: "the text is engraved and filled",
};

/** Ett namn som printas ligger plant på ytan, i kundens färg, och är ingen gravyr. */
const PRINTED_TEXT = "the text is printed flat on the surface in colour, not engraved";

const SHAPE_DESCRIPTION: Record<BadgeShape, string> = {
  rectangle: "rectangle",
  rounded: "rectangle with rounded corners",
  stadium: "pill shape with fully rounded ends",
  oval: "oval",
  round: "circle",
  hexagon: "elongated hexagon with points left and right",
  octagon: "octagon with cut corners",
  cushion: "cushion shape: a rectangle whose four sides bow gently outwards, with softly rounded corners",
  custom: "custom outline, exactly as in the reference image",
};

const LOGO_POSITION: Record<LogoPlacement, string> = {
  left: "to the left of the text",
  right: "to the right of the text",
  top: "above the text",
};

/**
 * Textens färger, som de står på skylten. Ett namn som printas har kundens egen färg, också
 * en per rad; gravyr har materialets. Förut stod alltid gravyrens färg här, så att bildmodellen
 * ritade en svartvit skylt fast den var i färg (besked via ägaren 2026-11-18).
 */
function textColours(doc: BadgeDocument, engraving: string): string | null {
  const inks = engravedRows(doc).map((row) => rowPrintInkOf(doc, row) ?? engraving);
  const [first] = inks;
  if (first === undefined) return null;
  if (inks.every((ink) => ink === first)) return `text ${first}`;
  return inks.map((ink, i) => `text line ${i + 1} ${ink}`).join(", ");
}

/** Loggan som den sitter på skylten: tryckt i sina egna färger, tryckt i en färg eller graverad. */
function logoDescription(doc: BadgeDocument, engraving: string): string {
  if (!doc.logo) return "No other text, logos or symbols on the badge.";
  const position = engravedRows(doc).length > 0 ? `, ${LOGO_POSITION[doc.logo.placement]}` : "";
  const printed = logoMarking(doc) === "print";
  const logo =
    printed && doc.logo.image
      ? "the logo printed in full colour exactly as in the reference image. Keep its shape and every one of its colours exactly; never turn it black, white, grey or single-colour"
      : printed
        ? `the logo printed flat in a single colour (${logoPrintInkOf(doc) ?? engraving}) exactly as in the reference image. Keep its shape and colour exactly`
        : "the engraved single-colour logo exactly as in the reference image. Keep its shape exactly";
  return `The badge also carries ${logo}${position}; no other text, logos or symbols on the badge.`;
}

/** Det modellen måste återge exakt — text, logga, färger, mått, material och fäste. */
function badgeDescription(doc: BadgeDocument): string {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const rows = engravedRows(doc);
  const lines = rows.map((row, i) => `line ${i + 1}: "${row.text}"${row.bold ? " (bold)" : ""}`).join("; ");
  const shape = SHAPE_DESCRIPTION[doc.shape];
  const finish = color.lacquered ? LACQUERED_DESCRIPTION : FINISH_DESCRIPTION[material.finish];
  const marked = rows.length === 0 ? "" : `; ${nameMarking(doc) === "print" ? PRINTED_TEXT : finish.engraved}`;
  const colours = [`surface ${color.surface}`, textColours(doc, color.engraving)].filter(Boolean).join(", ");

  return [
    `The name badge is shown in the reference image. It is a small ${shape}, exactly ${doc.size.widthMm} × ${doc.size.heightMm} mm in real life (about the width of a credit card or smaller) — keep it that small relative to the body.`,
    `Material: ${finish.surface}${marked}. Colours, exactly as in the reference image: ${color.name.toLowerCase()} (${colours}).`,
    rows.length > 0
      ? `Text in Arial, reproduced letter for letter including Swedish characters å, ä, ö: ${lines}.`
      : "The badge has no text at all: do not add a name or any other text to it.",
    logoDescription(doc, color.engraving),
    `Fastened with a ${getMounting(doc.mounting).name.toLowerCase()} on the back, not visible from the front.`,
  ].join(" ");
}

const PLACEMENT =
  "Placement: on the wearer's own left side of the chest — when the person faces the camera this is the RIGHT half of the image. Horizontally about halfway between the centre of the chest and the left shoulder, never centred on the sternum. Vertically about a hand's width below the collarbone, where a shirt's breast pocket would sit. Parallel to the shoulder line, following the fabric's angle and perspective, with a subtle realistic contact shadow.";

const REALISM =
  "Hyperrealistic photograph, natural skin texture, true-to-life fabric, soft natural light, shot on a full-frame camera with a 50 mm lens, shallow depth of field. No watermark, no captions, no extra text anywhere in the image.";

/** Kundens miljötext hamnar i en prompt — bara vanlig text, kort, utan citattecken. */
export const MAX_WORKPLACE_CHARS = 240;

export function cleanWorkplace(raw: string | undefined): string | null {
  const text = (raw ?? "")
    .replace(/[\p{Cc}"`<>{}[\]\\]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WORKPLACE_CHARS);
  return text.length >= 3 ? text : null;
}

function roleSetting(doc: BadgeDocument, workplace: string | null): string {
  const title = engravedRows(doc)[1]?.text;
  if (workplace) {
    const role = title ? ` as "${title}"` : "";
    return `at work${role} in a real, lived-in Swedish workplace: ${workplace}. Photographed on location during a normal working day, with the environment clearly recognisable behind them, dressed exactly as staff there would be`;
  }
  return title
    ? `in a realistic Swedish workplace that suits the role "${title}", dressed as someone in that role would be at work`
    : "in a bright, minimalist Scandinavian workplace, dressed in smart-casual work clothes";
}

/** Prompt för en genererad person som bär skylten, i kundens miljö när den är känd. */
export function personaPrompt(doc: BadgeDocument, wearer: Wearer, workplace: string | null = null): string {
  return [
    `Half-body portrait of ${wearerDescription(wearer)}, ${roleSetting(doc, workplace)}. Looking naturally towards the camera.`,
    badgeDescription(doc),
    PLACEMENT,
    REALISM,
  ].join("\n\n");
}

/** Prompt för att sätta skylten på kundens eget foto (bild 1) med skylten som bild 2. */
export function tryOnPrompt(doc: BadgeDocument): string {
  return [
    "Edit the first image, a photo of a real person. Keep the person's face, identity, expression, hair, body, pose, clothing, background, lighting and framing exactly as they are. The only change is adding the name badge from the second image.",
    badgeDescription(doc),
    `${PLACEMENT} If the person wears a jacket or blazer, pin it on the left chest of the jacket.`,
    "Match the photo's lighting, colour temperature, sharpness and grain so the badge looks physically present in the original photograph.",
  ].join("\n\n");
}
