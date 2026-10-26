import {
  engravedRows,
  getColor,
  getMaterial,
  getMounting,
  type BadgeDocument,
  type MaterialFinish,
} from "@/engine";

/** En person i "Visa på personer". Beskrivningen går rakt in i prompten. */
export interface Persona {
  id: string;
  description: string;
}

export const PEOPLE_PERSONAS: readonly Persona[] = [
  {
    id: "woman-30s",
    description: "a Swedish woman in her mid-thirties with natural ash-blonde hair tied back, light makeup",
  },
  {
    id: "man-50s",
    description: "a Swedish man in his fifties with short grey hair and a neatly trimmed beard",
  },
  {
    id: "person-20s",
    description:
      "a Swedish person in their twenties with dark curly hair and a warm smile, from multicultural Stockholm",
  },
];

const FINISH_DESCRIPTION: Record<MaterialFinish, string> = {
  plastic: "two-layer engraving plastic with a smooth satin surface; the text is engraved through the top layer",
  aluminium: "brushed anodised aluminium with fine horizontal brush lines; the text is engraved and filled",
  steel: "brushed stainless steel; the text is laser-marked",
};

/** Det modellen måste återge exakt — text, mått, material och fäste. */
export function badgeDescription(doc: BadgeDocument): string {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const lines = engravedRows(doc)
    .map((row, i) => `line ${i + 1}: "${row.text}"${row.bold ? " (bold)" : ""}`)
    .join("; ");
  const shape =
    doc.shape === "oval" ? "oval" : doc.shape === "rounded" ? "rectangle with rounded corners" : "rectangle";

  return [
    `The name badge is shown in the reference image. It is a small ${shape}, exactly ${doc.size.widthMm} × ${doc.size.heightMm} mm in real life (about the width of a credit card or smaller) — keep it that small relative to the body.`,
    `Material: ${FINISH_DESCRIPTION[material.finish]}. Colours: ${color.name.toLowerCase()} (surface ${color.surface}, text ${color.engraving}).`,
    `Text in Arial, centred, reproduced letter for letter including Swedish characters å, ä, ö: ${lines}. No other text, logos or symbols on the badge.`,
    `Fastened with a ${getMounting(doc.mounting).name.toLowerCase()} on the back, not visible from the front.`,
  ].join(" ");
}

const PLACEMENT =
  "Placement: on the wearer's own left side of the chest — when the person faces the camera this is the RIGHT half of the image. Horizontally about halfway between the centre of the chest and the left shoulder, never centred on the sternum. Vertically about a hand's width below the collarbone, where a shirt's breast pocket would sit. Parallel to the shoulder line, following the fabric's angle and perspective, with a subtle realistic contact shadow.";

const REALISM =
  "Hyperrealistic photograph, natural skin texture, true-to-life fabric, soft natural light, shot on a full-frame camera with a 50 mm lens, shallow depth of field. No watermark, no captions, no extra text anywhere in the image.";

function roleSetting(doc: BadgeDocument): string {
  const title = engravedRows(doc)[1]?.text;
  return title
    ? `in a realistic Swedish workplace that suits the role "${title}", dressed as someone in that role would be at work`
    : "in a bright, minimalist Scandinavian workplace, dressed in smart-casual work clothes";
}

/** Prompt för en genererad person som bär skylten. */
export function personaPrompt(doc: BadgeDocument, persona: Persona): string {
  return [
    `Half-body portrait of ${persona.description}, ${roleSetting(doc)}. Looking naturally towards the camera.`,
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
