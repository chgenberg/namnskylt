"use client";

import { useEffect, useRef, useState } from "react";
import { imageUrl } from "@/features/shop/shop-blocks";
import type { ShopImage } from "@/lib/shops/editor-repository";
import styles from "./editor.module.css";

interface ImageLibraryProps {
  slug: string;
  images: readonly ShopImage[];
  uploading: boolean;
  onUpload: (files: File[]) => void;
  /** Välj till ett block; utan = bara bläddra och ta bort. */
  selected?: readonly string[];
  multiple?: boolean;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
}

/** Butikens bilder: dra in eller ladda upp, klicka för att välja. */
export function ImageLibrary({ slug, images, uploading, onUpload, selected = [], multiple = false, onToggle, onDelete }: ImageLibraryProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const files = (list: FileList | null) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
  return (
    <div
      className={styles.library}
      data-over={over || undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.target === e.currentTarget && setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(false);
        onUpload(files(e.dataTransfer.files));
      }}
    >
      <button type="button" className={styles.libraryDrop} onClick={() => input.current?.click()} disabled={uploading}>
        <span aria-hidden="true">＋</span>
        <strong>{uploading ? "Laddar upp…" : "Ladda upp bilder"}</strong>
        <small>eller dra in dem här — JPG, PNG, WebP eller HEIC</small>
      </button>
      {images.map((image) => {
        const index = selected.indexOf(image.id);
        return (
          <figure key={image.id} className={styles.libraryItem} data-selected={index >= 0 || undefined}>
            <button
              type="button"
              onClick={() => onToggle?.(image.id)}
              disabled={!onToggle}
              aria-pressed={onToggle ? index >= 0 : undefined}
              aria-label={index >= 0 ? `Vald bild ${index + 1}` : "Välj bilden"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- butikens egna, komprimerade bilder */}
              <img src={imageUrl(slug, image.id)} alt="" />
            </button>
            {index >= 0 && <span className={styles.libraryBadge}>{multiple ? index + 1 : "✓"}</span>}
            {onDelete && (
              <button type="button" className={styles.libraryDelete} aria-label="Ta bort bilden" onClick={() => onDelete(image.id)}>
                ✕
              </button>
            )}
          </figure>
        );
      })}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/avif"
        multiple
        hidden
        onChange={(e) => {
          onUpload(files(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface LibraryDialogProps extends ImageLibraryProps {
  title: string;
  onClose: () => void;
}

/** Bildbiblioteket som stort fönster, öppnat från ett block. */
export function ImageLibraryDialog({ title, onClose, ...library }: LibraryDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <header className={styles.dialogHead}>
        <div>
          <h2>{title}</h2>
          <p className={styles.hint}>{library.multiple ? "Klicka på bilderna i den ordning de ska visas." : "Klicka på en bild för att välja den."}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => ref.current?.close()}>
          Klar
        </button>
      </header>
      <ImageLibrary {...library} />
    </dialog>
  );
}
