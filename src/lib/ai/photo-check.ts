import { z } from "zod";

export const photoCheckSchema = z.object({
  people: z.number().int(),
  framing: z.enum(["full_body", "half_body", "head_only", "no_person"]),
  chestVisible: z.boolean(),
  reason: z.string(),
});

export type PhotoCheck = z.infer<typeof photoCheckSchema>;

/** Samma form som JSON Schema — synkas för hand med `photoCheckSchema`. */
export const PHOTO_CHECK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["people", "framing", "chestVisible", "reason"],
  properties: {
    people: { type: "integer", description: "Number of clearly visible people" },
    framing: { type: "string", enum: ["full_body", "half_body", "head_only", "no_person"] },
    chestVisible: {
      type: "boolean",
      description: "The upper chest is visible and not covered by hands or objects",
    },
    reason: {
      type: "string",
      description: "One short sentence in Swedish addressed to the user, explaining the verdict",
    },
  },
} as const;

/** Skylten sitter på bröstet — då måste en person synas från huvud till minst midja. */
export function isUsablePhoto(check: PhotoCheck): boolean {
  return (
    check.people === 1 &&
    (check.framing === "half_body" || check.framing === "full_body") &&
    check.chestVisible
  );
}

/** Kort svensk förklaring när fotot inte duger. */
export function photoRejection(check: PhotoCheck): string {
  if (check.people === 0 || check.framing === "no_person") return "Vi hittar ingen person på fotot.";
  if (check.people > 1) return "Fotot ska bara visa en person.";
  if (check.framing === "head_only") return "Ta ett foto från huvud till minst midjan — halvkropp eller helkropp.";
  if (!check.chestVisible) return "Bröstet måste synas — flytta händer eller föremål framför tröjan.";
  return check.reason;
}
