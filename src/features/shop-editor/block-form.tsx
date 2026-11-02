"use client";

import { imageUrl } from "@/features/shop/shop-blocks";
import { MAX_FAQ_ITEMS, MAX_GALLERY_IMAGES, MAX_STEPS, videoEmbed, type Block } from "@/lib/shops/content";
import { limitFor } from "@/lib/shops/content-ops";
import styles from "./editor.module.css";

interface BlockFormProps {
  slug: string;
  block: Block;
  onChange: (block: Block, key?: string) => void;
  /** Öppnar bildbiblioteket för blocket. */
  onOpenLibrary: (blockId: string) => void;
}

function ImageField({ slug, ids, label, onOpen, onClear }: { slug: string; ids: readonly string[]; label: string; onOpen: () => void; onClear?: () => void }) {
  return (
    <div className={styles.imageField}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.imageFieldRow}>
        {ids.length > 0 ? (
          ids.slice(0, 6).map((id) => (
            // eslint-disable-next-line @next/next/no-img-element -- butikens egna, komprimerade bilder
            <img key={id} src={imageUrl(slug, id)} alt="" />
          ))
        ) : (
          <span className={styles.imageFieldEmpty}>Ingen bild</span>
        )}
        {ids.length > 6 && <span className={styles.imageFieldMore}>+{ids.length - 6}</span>}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.ghost} onClick={onOpen}>
          {ids.length > 0 ? "Byt eller lägg till…" : "Välj bild…"}
        </button>
        {onClear && ids.length > 0 && (
          <button type="button" className={styles.ghost} onClick={onClear}>
            Ta bort bilden
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  max,
  multiline = false,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  multiline?: boolean;
  placeholder?: string;
  type?: "text" | "url" | "date";
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {multiline && (
          <small>
            {value.length}/{max}
          </small>
        )}
      </span>
      {multiline ? (
        <textarea value={value} maxLength={max} rows={4} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Fälten för ett block. Samma gränser som när man skriver direkt i sidan. */
export function BlockForm({ slug, block, onChange, onOpenLibrary }: BlockFormProps) {
  const set = (patch: Partial<Block>, field: string) => onChange({ ...block, ...patch } as Block, `${block.id}.${field}`);
  const lim = (path: string) => limitFor(block.kind, path);

  switch (block.kind) {
    case "header":
      return (
        <div className={styles.form}>
          <Field label="Rubrik" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <Field label="Ingress" value={block.lead} max={lim("lead")} multiline onChange={(lead) => set({ lead }, "lead")} />
          <div className={styles.segmented} role="radiogroup" aria-label="Placering">
            {(["left", "center"] as const).map((align) => (
              <button key={align} type="button" role="radio" aria-checked={block.align === align} onClick={() => set({ align }, "align")}>
                {align === "left" ? "Vänster" : "Centrerad"}
              </button>
            ))}
          </div>
          <ImageField
            slug={slug}
            label="Bild (valfri)"
            ids={block.imageId ? [block.imageId] : []}
            onOpen={() => onOpenLibrary(block.id)}
            onClear={() => set({ imageId: null }, "imageId")}
          />
        </div>
      );
    case "text":
      return (
        <div className={styles.form}>
          <Field label="Rubrik" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <Field label="Text" value={block.text} max={lim("text")} multiline onChange={(text) => set({ text }, "text")} />
        </div>
      );
    case "imageText":
      return (
        <div className={styles.form}>
          <ImageField
            slug={slug}
            label="Bild"
            ids={block.imageId ? [block.imageId] : []}
            onOpen={() => onOpenLibrary(block.id)}
            onClear={() => set({ imageId: null }, "imageId")}
          />
          <div className={styles.segmented} role="radiogroup" aria-label="Bildens sida">
            {(["left", "right"] as const).map((side) => (
              <button key={side} type="button" role="radio" aria-checked={block.imageSide === side} onClick={() => set({ imageSide: side }, "imageSide")}>
                Bild {side === "left" ? "till vänster" : "till höger"}
              </button>
            ))}
          </div>
          <Field label="Rubrik" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <Field label="Text" value={block.text} max={lim("text")} multiline onChange={(text) => set({ text }, "text")} />
          <Field label="Knapptext (valfri)" value={block.buttonLabel} max={lim("buttonLabel")} placeholder="Läs mer" onChange={(buttonLabel) => set({ buttonLabel }, "buttonLabel")} />
          <Field label="Knappens länk" type="url" value={block.buttonHref} max={300} placeholder="https://… eller /butik/…" onChange={(buttonHref) => set({ buttonHref }, "buttonHref")} />
        </div>
      );
    case "gallery":
      return (
        <div className={styles.form}>
          <Field label="Rubrik" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <ImageField slug={slug} label={`Bilder (${block.images.length} av ${MAX_GALLERY_IMAGES})`} ids={block.images} onOpen={() => onOpenLibrary(block.id)} />
        </div>
      );
    case "video": {
      const ok = block.url === "" || videoEmbed(block.url) !== null;
      return (
        <div className={styles.form}>
          <Field label="Länk från YouTube eller Vimeo" type="url" value={block.url} max={300} placeholder="https://www.youtube.com/watch?v=…" onChange={(url) => set({ url }, "url")} />
          {!ok && <p className={styles.error}>Länken känns inte igen. Kopiera adressen från YouTube eller Vimeo.</p>}
          <Field label="Rubrik (valfri)" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <Field label="Bildtext (valfri)" value={block.caption} max={lim("caption")} onChange={(caption) => set({ caption }, "caption")} />
          <p className={styles.hint}>YouTube visas utan spårningskakor tills besökaren startar filmen.</p>
        </div>
      );
    }
    case "steps":
    case "faq": {
      const isFaq = block.kind === "faq";
      const max = isFaq ? MAX_FAQ_ITEMS : MAX_STEPS;
      const items = block.items as { [key: string]: string }[];
      const keys = isFaq ? (["question", "answer"] as const) : (["title", "text"] as const);
      const setItems = (next: { [key: string]: string }[], field: string) => set({ items: next } as Partial<Block>, field);
      return (
        <div className={styles.form}>
          <Field label="Rubrik" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          {items.map((item, i) => (
            <div key={i} className={styles.item}>
              <div className={styles.itemHead}>
                <span>
                  {isFaq ? "Fråga" : "Steg"} {i + 1}
                </span>
                <span className={styles.itemActions}>
                  <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => setItems(swap(items, i, i - 1), "items")}>
                    ↑
                  </button>
                  <button type="button" aria-label="Flytta ner" disabled={i === items.length - 1} onClick={() => setItems(swap(items, i, i + 1), "items")}>
                    ↓
                  </button>
                  <button type="button" aria-label="Ta bort" disabled={items.length <= 1} onClick={() => setItems(items.filter((_, n) => n !== i), "items")}>
                    ✕
                  </button>
                </span>
              </div>
              <Field
                label={isFaq ? "Fråga" : "Rubrik"}
                value={item[keys[0]] ?? ""}
                max={lim(`items.${i}.${keys[0]}`)}
                onChange={(v) => setItems(items.map((it, n) => (n === i ? { ...it, [keys[0]]: v } : it)), `items.${i}.${keys[0]}`)}
              />
              <Field
                label={isFaq ? "Svar" : "Text"}
                multiline
                value={item[keys[1]] ?? ""}
                max={lim(`items.${i}.${keys[1]}`)}
                onChange={(v) => setItems(items.map((it, n) => (n === i ? { ...it, [keys[1]]: v } : it)), `items.${i}.${keys[1]}`)}
              />
            </div>
          ))}
          {items.length < max && (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setItems([...items, isFaq ? { question: "Ny fråga", answer: "Svar" } : { title: "Nytt steg", text: "Beskrivning" }], "items")}
            >
              + {isFaq ? "Fråga" : "Steg"}
            </button>
          )}
        </div>
      );
    }
    case "banner":
      return (
        <div className={styles.form}>
          <Field label="Text" value={block.text} max={lim("text")} onChange={(text) => set({ text }, "text")} />
          <Field label="Länk (valfri)" type="url" value={block.href} max={300} placeholder="https://… eller /butik/…" onChange={(href) => set({ href }, "href")} />
          <Field label="Visas till och med (valfritt)" type="date" value={block.until} max={10} onChange={(until) => set({ until }, "until")} />
        </div>
      );
    case "map":
      return (
        <div className={styles.form}>
          <Field label="Rubrik (valfri)" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <Field label="Adress" value={block.address} max={lim("address")} placeholder="Storgatan 1, 123 45 Staden" onChange={(address) => set({ address }, "address")} />
          <p className={styles.hint}>Kartan söker på adressen. Visas inte på sidan förrän en adress är ifylld.</p>
        </div>
      );
    case "contact":
      return (
        <div className={styles.form}>
          <Field label="Rubrik" value={block.title} max={lim("title")} onChange={(title) => set({ title }, "title")} />
          <Field label="Text" value={block.text} max={lim("text")} multiline onChange={(text) => set({ text }, "text")} />
          <p className={styles.hint}>Telefon, e-post och adress hämtas från butikens uppgifter.</p>
        </div>
      );
  }
}

function swap<T>(list: readonly T[], a: number, b: number): T[] {
  const next = [...list];
  const x = next[a];
  const y = next[b];
  if (x === undefined || y === undefined) return next;
  next[a] = y;
  next[b] = x;
  return next;
}
