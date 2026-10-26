import "server-only";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { PHOTO_CHECK_JSON_SCHEMA, photoCheckSchema, type PhotoCheck } from "./photo-check";
import { UNKNOWN_WEARER, type Wearer } from "./prompts";

export const IMAGE_MODEL = "gpt-image-2";
export const VISION_MODEL = "gpt-5.4-mini";

let client: OpenAI | null = null;

/** `null` när ingen nyckel är satt — funktionerna stängs då av i stället för att krascha. */
export function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client ??= new OpenAI({ apiKey, timeout: 170_000, maxRetries: 1 });
  return client;
}

export type ImageFile = { data: Buffer; name: string; type: string };

interface EditOptions {
  prompt: string;
  images: readonly ImageFile[];
  size: "1024x1536" | "1536x1024" | "1024x1024" | "auto";
  quality: "medium" | "high";
}

/** Bildredigering med referensbilder; returnerar en JPEG som data-URL. */
export async function editImage(ai: OpenAI, options: EditOptions): Promise<string> {
  const images = await Promise.all(
    options.images.map((image) => toFile(image.data, image.name, { type: image.type })),
  );
  const result = await ai.images.edit({
    model: IMAGE_MODEL,
    image: images,
    prompt: options.prompt,
    size: options.size,
    quality: options.quality,
    output_format: "jpeg",
    output_compression: 90,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return `data:image/jpeg;base64,${b64}`;
}

const GENDERS = ["female", "male", "unknown"] as const;
const AGES = ["young", "middle", "older", "unknown"] as const;

const WEARER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gender", "age"],
  properties: {
    gender: { type: "string", enum: GENDERS },
    age: { type: "string", enum: AGES },
  },
} as const;

const wearerSchema = z.object({ gender: z.enum(GENDERS), age: z.enum(AGES) });

const WEARER_INSTRUCTIONS = [
  "If the text contains a personal first name, judge it as a name used in Sweden.",
  "gender: whether the first name is predominantly female or male in Sweden. Answer unknown if it is unisex in Sweden (e.g. Kim, Robin, Alex) or ambiguous.",
  "age: the most likely age of a working adult with this first name, based on when it was most popular in Sweden. young = about 20–32 (e.g. Wilma, Elsa, Liam, Oscar, Alva), middle = about 33–50 (e.g. Sara, Emma, Johan, Andreas, Linda), older = about 51–67 (e.g. Gunilla, Birgitta, Lars, Kjell, Ulf, Bengt). Answer unknown if the name has been common across generations.",
  "Answer unknown for both if it is not a person's name (e.g. a job title or a company).",
].join(" ");

/**
 * Kön och ungefärlig ålder som förnamnet på skylten antyder i Sverige,
 * så att den genererade personen passar namnet. Fel → okänd person.
 */
export async function guessWearer(ai: OpenAI, badgeText: string): Promise<Wearer> {
  try {
    const response = await ai.responses.create({
      model: VISION_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `This is the first line of a name badge: ${JSON.stringify(badgeText)}. ${WEARER_INSTRUCTIONS}`,
            },
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "wearer", strict: true, schema: WEARER_JSON_SCHEMA },
      },
    });
    return wearerSchema.parse(JSON.parse(response.output_text));
  } catch (error) {
    console.error("Kunde inte tolka namnet på skylten", error);
    return UNKNOWN_WEARER;
  }
}

/** Klassar kundens foto innan vi lägger pengar på en bildgenerering. */
export async function checkPhoto(ai: OpenAI, photo: ImageFile): Promise<PhotoCheck> {
  const response = await ai.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Classify this photo for a virtual name-badge try-on. half_body = head to at least mid-torso; full_body = head to feet or knees; head_only = face/shoulders only.",
          },
          {
            type: "input_image",
            image_url: `data:${photo.type};base64,${photo.data.toString("base64")}`,
            detail: "low",
          },
        ],
      },
    ],
    text: {
      format: { type: "json_schema", name: "photo_check", strict: true, schema: PHOTO_CHECK_JSON_SCHEMA },
    },
  });
  return photoCheckSchema.parse(JSON.parse(response.output_text));
}
