import { z } from "zod";
import { CUSTOM_SHAPE_LIMITS, LOGO_LIMITS, MATERIALS, MATERIAL_IDS, SHAPE_IDS, SIZE_LIMITS, TEXT_LIMITS } from "./catalog";
import { CUSTOM_OUTLINE_ISSUE_TEXT, customOutlineIssue } from "./custom-outline";
import { LOGO_IMAGE_PATTERN, LOGO_IMAGE_REF_PATTERN, LOGO_PATH_PATTERN } from "./logo";
import type { BadgeDocument } from "./types";

/** Förflyttningen hålls inom skylten av layouten; schemat stoppar bara orimliga tal. */
const offsetSchema = z.object({
  xMm: z.number().finite().min(-SIZE_LIMITS.maxWidthMm).max(SIZE_LIMITS.maxWidthMm),
  yMm: z.number().finite().min(-CUSTOM_SHAPE_LIMITS.maxSideMm).max(CUSTOM_SHAPE_LIMITS.maxSideMm),
});

/** Körs både i designern och i API:t — servern litar aldrig på klientens dokument. */
export const badgeDocumentSchema = z
  .object({
    version: z.literal(1),
    materialId: z.enum(MATERIAL_IDS),
    colorId: z.string().min(1),
    shape: z.enum(SHAPE_IDS),
    size: z.object({
      // En egen form får vara smalare och högre än ämnena; övriga former hålls till sina gränser nedan.
      widthMm: z.number().min(CUSTOM_SHAPE_LIMITS.minSideMm).max(SIZE_LIMITS.maxWidthMm),
      heightMm: z.number().min(SIZE_LIMITS.minHeightMm).max(CUSTOM_SHAPE_LIMITS.maxSideMm),
    }),
    cornerRadiusMm: z.number().min(0).max(30),
    customOutline: z
      .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
      .min(CUSTOM_SHAPE_LIMITS.minPoints)
      .max(CUSTOM_SHAPE_LIMITS.maxPoints)
      .optional(),
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
    textOffsetMm: offsetSchema.optional(),
    logo: z
      .object({
        d: z.string().min(1).max(LOGO_LIMITS.maxPathChars).regex(LOGO_PATH_PATTERN),
        viewWidth: z.number().positive().max(LOGO_LIMITS.maxViewSize),
        viewHeight: z.number().positive().max(LOGO_LIMITS.maxViewSize),
        placement: z.enum(["left", "right", "top"]),
        heightMm: z.number().min(LOGO_LIMITS.minHeightMm).max(LOGO_LIMITS.maxHeightMm),
        offsetMm: offsetSchema.optional(),
        // Bilden ligger i skylten som data-URL, eller på servern och pekas ut med sin adress.
        image: z
          .object({
            src: z.union([
              z.string().regex(LOGO_IMAGE_REF_PATTERN),
              z.string().max(LOGO_LIMITS.maxImageChars).regex(LOGO_IMAGE_PATTERN),
            ]),
          })
          .optional(),
      })
      .optional(),
    mounting: z.enum(["pin", "magnet", "clip", "safety-pin"]),
    quantity: z.number().int().min(1).max(10_000),
  })
  .superRefine((doc, ctx) => {
    const material = MATERIALS.find((m) => m.id === doc.materialId);
    if (material && !material.colors.some((c) => c.id === doc.colorId)) {
      ctx.addIssue({ code: "custom", path: ["colorId"], message: "Färgen finns inte i materialet" });
    }
    if (doc.shape === "custom") {
      const issue = customOutlineIssue(doc.customOutline ?? [], doc.size);
      if (issue) ctx.addIssue({ code: "custom", path: ["customOutline"], message: CUSTOM_OUTLINE_ISSUE_TEXT[issue] });
      if (!material?.customShape) {
        ctx.addIssue({ code: "custom", path: ["shape"], message: "Materialet går inte att skära i egen form" });
      }
    } else {
      if (doc.customOutline) {
        ctx.addIssue({ code: "custom", path: ["customOutline"], message: "Bara egen form har en egen kontur" });
      }
      if (doc.size.widthMm < SIZE_LIMITS.minWidthMm) {
        ctx.addIssue({ code: "custom", path: ["size", "widthMm"], message: `Minst ${SIZE_LIMITS.minWidthMm} mm` });
      }
      if (doc.size.heightMm > SIZE_LIMITS.maxHeightMm) {
        ctx.addIssue({ code: "custom", path: ["size", "heightMm"], message: `Högst ${SIZE_LIMITS.maxHeightMm} mm` });
      }
    }
    if (doc.shape === "round" && doc.size.widthMm !== doc.size.heightMm) {
      ctx.addIssue({ code: "custom", path: ["size"], message: "En rund skylt är lika bred som hög" });
    }
    if (doc.rows.every((r) => r.text.trim().length === 0)) {
      ctx.addIssue({ code: "custom", path: ["rows"], message: "Skylten saknar text" });
    }
  }) satisfies z.ZodType<BadgeDocument>;
