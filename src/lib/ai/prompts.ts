import {
  engravedRows,
  getColor,
  getMaterial,
  getMounting,
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

const FINISH_DESCRIPTION: Record<MaterialFinish, string> = {
  plastic: "two-layer engraving plastic with a smooth satin surface; the text is engraved through the top layer",
  aluminium: "brushed anodised aluminium with fine horizontal brush lines; the text is engraved and filled",
  steel: "brushed stainless steel; the text is laser-marked",
  brass: "polished solid brass with a fine metallic sheen; the text is engraved and filled black",
  acrylic: "matt transparent acrylic, about 3 mm thick, over a coloured backing that gives a soft shadow depth; the text is printed",
  epoxy: "printed badge under a clear, glossy domed epoxy enamel that catches the light; the text is printed",
};

const SHAPE_DESCRIPTION: Record<BadgeShape, string> = {
  rectangle: "rectangle",
  rounded: "rectangle with rounded corners",
  stadium: "pill shape with fully rounded ends",
  oval: "oval",
  round: "circle",
  hexagon: "elongated hexagon with points left and right",
  octagon: "octagon with cut corners",
};

const LOGO_POSITION: Record<LogoPlacement, string> = {
  left: "to the left of the text",
  right: "to the right of the text",
  top: "above the text",
};

/** Det modellen måste återge exakt — text, logga, mått, material och fäste. */
export function badgeDescription(doc: BadgeDocument): string {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const lines = engravedRows(doc)
    .map((row, i) => `line ${i + 1}: "${row.text}"${row.bold ? " (bold)" : ""}`)
    .join("; ");
  const shape = SHAPE_DESCRIPTION[doc.shape];

  return [
    `The name badge is shown in the reference image. It is a small ${shape}, exactly ${doc.size.widthMm} × ${doc.size.heightMm} mm in real life (about the width of a credit card or smaller) — keep it that small relative to the body.`,
    `Material: ${FINISH_DESCRIPTION[material.finish]}. Colours: ${color.name.toLowerCase()} (surface ${color.surface}, text ${color.engraving}).`,
    `Text in Arial, reproduced letter for letter including Swedish characters å, ä, ö: ${lines}.`,
    doc.logo
      ? `The badge also carries the engraved single-colour logo exactly as in the reference image, ${LOGO_POSITION[doc.logo.placement]}. Keep its shape exactly; no other text, logos or symbols on the badge.`
      : "No other text, logos or symbols on the badge.",
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
