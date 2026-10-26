import "server-only";
import OpenAI, { toFile } from "openai";
import { PHOTO_CHECK_JSON_SCHEMA, photoCheckSchema, type PhotoCheck } from "./photo-check";

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
