import { engravedRows, type BadgeDocument } from "@/engine";

const SWEDISH_LETTERS: Record<string, string> = { å: "a", ä: "a", ö: "o", é: "e", ü: "u" };

/** "Åsa Öberg" → `namnskylt-asa-oberg-3d.mp4`. */
export function videoFileName(doc: BadgeDocument, extension: string): string {
  const name = engravedRows(doc)[0]?.text ?? "";
  const slug = name
    .toLowerCase()
    .replace(/[åäöéü]/g, (letter) => SWEDISH_LETTERS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `namnskylt${slug ? `-${slug}` : ""}-3d.${extension}`;
}
