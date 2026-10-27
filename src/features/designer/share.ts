import { engravedRows, type BadgeDocument } from "@/engine";
import { encodeShareCode } from "@/lib/share/share-link";
import { videoFileName } from "./video-file";

async function shareImage(doc: BadgeDocument): Promise<Blob> {
  const response = await fetch("/api/share-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ badge: doc }),
  });
  if (!response.ok) throw new Error("Bilden kunde inte skapas");
  return response.blob();
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Delar skylten som bild och länk. Mobilens delningsmeny när den klarar
 * filer; annars kopieras länken och bilden laddas ner. Svaret är en svensk
 * statusrad till kunden.
 */
export async function shareBadge(doc: BadgeDocument): Promise<string> {
  const [{ code, droppedLogo }, image] = await Promise.all([encodeShareCode(doc), shareImage(doc)]);
  const url = `${window.location.origin}/skapa?d=${code}`;
  const name = engravedRows(doc)[0]?.text.trim();
  const title = name ? `Namnskylt — ${name}` : "Min namnskylt";
  const file = new File([image], videoFileName(doc, "png", "delning"), { type: "image/png" });
  const logoNote = droppedLogo ? " Loggan var för stor för länken men finns med på bilden." : "";

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, text: `${title}\n${url}`, files: [file] });
      return `Delad.${logoNote}`;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "";
    }
  }
  await navigator.clipboard?.writeText(url).catch(() => undefined);
  download(image, file.name);
  return `Länken är kopierad och bilden nedladdad.${logoNote}`;
}
