import { z } from "zod";
import { MATERIALS, SIZE_LIMITS, TEXT_LIMITS } from "./catalog";
import type { BadgeDocument } from "./types";

/** Körs både i designern och i API:t — servern litar aldrig på klientens dokument. */
export const badgeDocumentSchema = z
  .object({
    version: z.literal(1),
    materialId: z.enum(["plastic-2-layer", "aluminium-anodized", "stainless"]),
    colorId: z.string().min(1),
    shape: z.enum(["rectangle", "rounded", "oval"]),
    size: z.object({
      widthMm: z.number().min(SIZE_LIMITS.minWidthMm).max(SIZE_LIMITS.maxWidthMm),
      heightMm: z.number().min(SIZE_LIMITS.minHeightMm).max(SIZE_LIMITS.maxHeightMm),
    }),
    cornerRadiusMm: z.number().min(0).max(30),
    frame: z.object({
      style: z.enum(["none", "solid", "double"]),
      insetMm: z.number().min(0.5).max(6),
      thicknessMm: z.number().min(0.2).max(1.5),
    }),
    font: z.enum(["arial", "arial-narrow"]),
    align: z.enum(["left", "center", "right"]),
    rows: z
      .array(
        z.object({
          id: z.string().min(1),
          text: z.string().max(TEXT_LIMITS.maxChars),
          capHeightMm: z.number().min(TEXT_LIMITS.minCapHeightMm).max(TEXT_LIMITS.maxCapHeightMm),
          bold: z.boolean(),
        }),
      )
      .min(1)
      .max(TEXT_LIMITS.maxRows),
    mounting: z.enum(["pin", "magnet", "clip", "safety-pin"]),
    quantity: z.number().int().min(1).max(10_000),
  })
  .superRefine((doc, ctx) => {
    const material = MATERIALS.find((m) => m.id === doc.materialId);
    if (material && !material.colors.some((c) => c.id === doc.colorId)) {
      ctx.addIssue({ code: "custom", path: ["colorId"], message: "Färgen finns inte i materialet" });
    }
    if (doc.rows.every((r) => r.text.trim().length === 0)) {
      ctx.addIssue({ code: "custom", path: ["rows"], message: "Skylten saknar text" });
    }
  }) satisfies z.ZodType<BadgeDocument>;
