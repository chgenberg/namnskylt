"use client";

import { useRef, useState } from "react";
import { imageUrl } from "@/features/shop/shop-blocks";
import type { ShopImage } from "@/lib/shops/editor-repository";
import styles from "./editor.module.css";

interface ImagePickerProps {
  slug: string;
  images: readonly ShopImage[];
  selected: readonly string[];
  multiple?: boolean;
  onPick: (id: string) => void;
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}

/** Butikens bilder att välja bland, och uppladdning — klicka eller dra in en fil. */
export function ImagePicker({ slug, images, selected, multiple = false, onPick, onUpload, uploading }: ImagePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const upload = async (files: FileList | null) => {
    for (const file of Array.from(files ?? []).slice(0, multiple ? 12 : 1)) await onUpload(file);
  };
  return (
    <div
      className={styles.picker}
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className={styles.pickerGrid}>
        <button type="button" className={styles.pickerUpload} onClick={() => input.current?.click()} disabled={uploading}>
          {uploading ? "Laddar upp…" : "+ Ladda upp"}
        </button>
        {images.map((image) => {
          const index = selected.indexOf(image.id);
          return (
            <button
              key={image.id}
              type="button"
              className={styles.pickerItem}
              aria-pressed={index >= 0}
              aria-label={index >= 0 ? `Vald bild ${index + 1}` : "Välj bilden"}
              onClick={() => onPick(image.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- butikens egna, komprimerade bilder */}
              <img src={imageUrl(slug, image.id)} alt="" loading="lazy" />
              {index >= 0 && <span className={styles.pickerBadge}>{multiple ? index + 1 : "✓"}</span>}
            </button>
          );
        })}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/avif"
        multiple={multiple}
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
