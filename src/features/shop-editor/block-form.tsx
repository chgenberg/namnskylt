"use client";

import { MAX_FAQ_ITEMS, MAX_GALLERY_IMAGES, MAX_STEPS, type Block } from "@/lib/shops/content";
import { limitFor } from "@/lib/shops/content-ops";
import type { ShopImage } from "@/lib/shops/editor-repository";
import { ImagePicker } from "./image-picker";
import styles from "./editor.module.css";

interface BlockFormProps {
  slug: string;
  block: Block;
  images: readonly ShopImage[];
  onChange: (block: Block, key?: string) => void;
  onUpload: (file: File) => Promise<ShopImage | null>;
  uploading: boolean;
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
export function BlockForm({ slug, block, images, onChange, onUpload, uploading }: BlockFormProps) {
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
          <span className={styles.fieldLabel}>Bild (valfri)</span>
          <ImagePicker
            slug={slug}
            images={images}
            selected={block.imageId ? [block.imageId] : []}
            onPick={(id) => set({ imageId: block.imageId === id ? null : id }, "imageId")}
            onUpload={async (file) => {
              const image = await onUpload(file);
              if (image) set({ imageId: image.id }, "imageId");
            }}
            uploading={uploading}
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
          <ImagePicker
            slug={slug}
            images={images}
            selected={block.imageId ? [block.imageId] : []}
            onPick={(id) => set({ imageId: id }, "imageId")}
            onUpload={async (file) => {
              const image = await onUpload(file);
              if (image) set({ imageId: image.id }, "imageId");
            }}
            uploading={uploading}
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
          <ImagePicker
            slug={slug}
            images={images}
            multiple
            selected={block.images}
            onPick={(id) => {
              const has = block.images.includes(id);
              if (!has && block.images.length >= MAX_GALLERY_IMAGES) return;
              set({ images: has ? block.images.filter((i) => i !== id) : [...block.images, id] }, "images");
            }}
            onUpload={async (file) => {
              const image = await onUpload(file);
              if (image && block.images.length < MAX_GALLERY_IMAGES) set({ images: [...block.images, image.id] }, "images");
            }}
            uploading={uploading}
          />
          <p className={styles.hint}>
            {block.images.length} av högst {MAX_GALLERY_IMAGES} bilder. Klicka för att välja eller välja bort.
          </p>
        </div>
      );
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
