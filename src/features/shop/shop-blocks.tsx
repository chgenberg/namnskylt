"use client";

import { Fragment, useLayoutEffect, useRef, type DragEvent, type ElementType, type KeyboardEvent, type MouseEvent } from "react";
import { isBannerActive, mapEmbedUrl, videoEmbed, type Block } from "@/lib/shops/content";
import type { ShopContact } from "@/lib/shops/view";
import styles from "./shop.module.css";

export type { ShopContact };

/** Redigering i förhandsvisningen: klick väljer blocket, texten skrivs direkt i sidan, block dras och släpps. */
export interface BlockEditing {
  selectedId: string | null;
  onSelect: (blockId: string) => void;
  onText: (blockId: string, path: string, value: string) => void;
  /** Var ett draget block hamnar: före blocket med det indexet, eller sist. */
  dropIndex: number | null;
  onAction: (blockId: string, action: "up" | "down" | "duplicate" | "remove") => void;
  onDragBlock: (blockId: string, event: DragEvent<HTMLElement>) => void;
  onPickImage: (blockId: string) => void;
  labelOf: (block: Block) => string;
}

interface ShopBlocksProps {
  slug: string;
  blocks: readonly Block[];
  contact: ShopContact;
  /** YYYY-MM-DD, för kampanjremsor med slutdatum. */
  today: string;
  editing?: BlockEditing;
}

export const imageUrl = (slug: string, id: string) => `/butik/${slug}/bild/${id}`;

/**
 * Text som skrivs direkt i sidan. React rör inte innehållet medan man skriver —
 * annars hoppar markören till början vid varje tecken.
 */
function Editable({
  as: Tag,
  value,
  className,
  multiline = false,
  placeholder,
  onChange,
}: {
  as: ElementType;
  value: string;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (!focused.current && ref.current && ref.current.innerText !== value) ref.current.innerText = value;
  }, [value]);
  return (
    <Tag
      ref={ref}
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-editable=""
      data-placeholder={placeholder}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e: { currentTarget: HTMLElement }) => {
        focused.current = false;
        onChange(e.currentTarget.innerText);
      }}
      onInput={(e: { currentTarget: HTMLElement }) => onChange(e.currentTarget.innerText)}
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** I förhandsvisningen: en tydlig knapp där en bild kan ligga. */
function AddImage({ blockId, editing, label = "Lägg till bild" }: { blockId: string; editing: BlockEditing; label?: string }) {
  return (
    <button
      type="button"
      className={styles.addImage}
      contentEditable={false}
      onClick={(e) => {
        e.stopPropagation();
        editing.onPickImage(blockId);
      }}
    >
      <span aria-hidden="true">＋</span>
      {label}
    </button>
  );
}

function useText(block: Block, editing?: BlockEditing) {
  return function Text({
    as,
    path,
    value,
    className,
    multiline,
    placeholder,
  }: {
    as: ElementType;
    path: string;
    value: string;
    className?: string;
    multiline?: boolean;
    placeholder?: string;
  }) {
    if (!editing) {
      if (!value) return null;
      const Tag = as;
      return <Tag className={className}>{value}</Tag>;
    }
    return (
      <Editable
        as={as}
        value={value}
        className={className}
        multiline={multiline}
        placeholder={placeholder}
        onChange={(next) => editing.onText(block.id, path, next)}
      />
    );
  };
}

function BlockView({ slug, block, contact, today, editing }: Omit<ShopBlocksProps, "blocks"> & { block: Block }) {
  const Text = useText(block, editing);
  switch (block.kind) {
    case "header":
      return (
        <div className={styles.pageHeader} data-align={block.align} data-image={block.imageId ? "" : undefined}>
          <div className={styles.pageHeaderCopy}>
            <Text as="h1" path="title" value={block.title} className={styles.pageHeaderTitle} placeholder="Rubrik" />
            <Text as="p" path="lead" value={block.lead} className={styles.pageHeaderLead} multiline placeholder="Ingress" />
          </div>
          {block.imageId ? (
            <div className={styles.pageHeaderImage}>
              {/* eslint-disable-next-line @next/next/no-img-element -- butikens egen bild, redan komprimerad */}
              <img src={imageUrl(slug, block.imageId)} alt="" />
              {editing && <AddImage blockId={block.id} editing={editing} label="Byt bild" />}
            </div>
          ) : (
            editing && (
              <div className={styles.imageSlot}>
                <AddImage blockId={block.id} editing={editing} label="Lägg till en stor bild (valfritt)" />
              </div>
            )
          )}
        </div>
      );
    case "text":
      return (
        <div className={styles.textBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik" />
          <Text as="p" path="text" value={block.text} className={styles.blockText} multiline placeholder="Text" />
        </div>
      );
    case "imageText":
      return (
        <div className={styles.imageText} data-side={block.imageSide}>
          <div className={styles.imageFrame}>
            {block.imageId && (
              // eslint-disable-next-line @next/next/no-img-element -- butikens egen bild, redan komprimerad
              <img src={imageUrl(slug, block.imageId)} alt={block.title} loading="lazy" />
            )}
            {editing && <AddImage blockId={block.id} editing={editing} label={block.imageId ? "Byt bild" : "Lägg till bild"} />}
          </div>
          <div className={styles.imageCopy}>
            <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik" />
            <Text as="p" path="text" value={block.text} className={styles.blockText} multiline placeholder="Text" />
            {block.buttonLabel && block.buttonHref && (
              <a href={editing ? undefined : block.buttonHref} className={`btn btn--primary ${styles.blockButton}`}>
                {block.buttonLabel}
              </a>
            )}
          </div>
        </div>
      );
    case "gallery":
      return (
        <div className={styles.galleryBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik" />
          {(block.images.length > 0 || editing) && (
            <div className={styles.gallery}>
              {block.images.map((imageId) => (
                // eslint-disable-next-line @next/next/no-img-element -- butikens egna bilder, redan komprimerade
                <img key={imageId} src={imageUrl(slug, imageId)} alt="" loading="lazy" />
              ))}
              {editing && (
                <div className={styles.galleryAdd}>
                  <AddImage blockId={block.id} editing={editing} label={block.images.length ? "Fler bilder" : "Lägg till bilder"} />
                </div>
              )}
            </div>
          )}
        </div>
      );
    case "video": {
      const embed = videoEmbed(block.url);
      return (
        <div className={styles.videoBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik (valfri)" />
          <div className={styles.videoFrame}>
            {embed ? (
              <iframe
                src={embed.src}
                title={block.title || "Video"}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                style={editing ? { pointerEvents: "none" } : undefined}
              />
            ) : (
              editing && <p className={styles.videoEmpty}>Klistra in en länk från YouTube eller Vimeo i panelen</p>
            )}
          </div>
          <Text as="p" path="caption" value={block.caption} className={styles.videoCaption} placeholder="Bildtext (valfri)" />
        </div>
      );
    }
    case "steps":
      return (
        <div className={styles.stepsBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik" />
          <div className={styles.usps}>
            {block.items.map((item, i) => (
              <article key={i} className={styles.usp}>
                <span className={styles.uspNo}>{i + 1}</span>
                <Text as="h3" path={`items.${i}.title`} value={item.title} className={styles.uspTitle} />
                <Text as="p" path={`items.${i}.text`} value={item.text} className={styles.uspText} multiline />
              </article>
            ))}
          </div>
        </div>
      );
    case "faq":
      return (
        <div className={styles.faqBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik" />
          <div className={styles.faq}>
            {block.items.map((item, i) =>
              editing ? (
                <div key={i} className={styles.faqItem}>
                  <Text as="h3" path={`items.${i}.question`} value={item.question} className={styles.faqQuestion} />
                  <Text as="p" path={`items.${i}.answer`} value={item.answer} className={styles.faqAnswer} multiline />
                </div>
              ) : (
                <details key={i} className={styles.faqItem}>
                  <summary className={styles.faqQuestion}>{item.question}</summary>
                  <p className={styles.faqAnswer}>{item.answer}</p>
                </details>
              ),
            )}
          </div>
        </div>
      );
    case "banner": {
      if (!editing && !isBannerActive(block, today)) return null;
      const inner = <Text as="span" path="text" value={block.text} placeholder="Kampanjtext" />;
      return (
        <div className={styles.banner}>
          {block.href && !editing ? <a href={block.href}>{inner} →</a> : inner}
        </div>
      );
    }
    case "map": {
      const src = mapEmbedUrl(block.address);
      if (!src && !editing) return null;
      return (
        <div className={styles.mapBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik (valfri)" />
          <div className={styles.mapFrame}>
            {src ? (
              <iframe
                src={src}
                title={`Karta: ${block.address}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={editing ? { pointerEvents: "none" } : undefined}
              />
            ) : (
              <p className={styles.videoEmpty}>Skriv er adress i panelen så visas kartan här</p>
            )}
          </div>
          {block.address && <p className={styles.videoCaption}>{block.address}</p>}
        </div>
      );
    }
    case "contact": {
      const lines = [contact.phone, contact.email, contact.address].filter(Boolean);
      return (
        <div className={styles.contactBlock}>
          <Text as="h2" path="title" value={block.title} className={styles.blockTitle} placeholder="Rubrik" />
          <Text as="p" path="text" value={block.text} className={styles.blockText} multiline placeholder="Text" />
          {lines.length > 0 && (
            <ul className={styles.contactLines}>
              {contact.phone && (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
              )}
              {contact.address && <li>{contact.address}</li>}
            </ul>
          )}
          {contact.email && !editing && (
            <a href={`mailto:${contact.email}`} className={`btn btn--primary ${styles.blockButton}`}>
              Mejla {contact.name}
            </a>
          )}
        </div>
      );
    }
  }
}

function BlockTools({ block, index, count, editing }: { block: Block; index: number; count: number; editing: BlockEditing }) {
  const act = (action: "up" | "down" | "duplicate" | "remove") => (e: MouseEvent) => {
    e.stopPropagation();
    editing.onAction(block.id, action);
  };
  return (
    <div className={styles.blockTools} contentEditable={false} onClick={(e) => e.stopPropagation()}>
      <span className={styles.blockHandle} draggable onDragStart={(e) => editing.onDragBlock(block.id, e)} title="Dra för att flytta">
        ⠿ {editing.labelOf(block)}
      </span>
      <button type="button" onClick={act("up")} disabled={index === 0} aria-label="Flytta upp" title="Flytta upp">
        ↑
      </button>
      <button type="button" onClick={act("down")} disabled={index === count - 1} aria-label="Flytta ner" title="Flytta ner">
        ↓
      </button>
      <button type="button" onClick={act("duplicate")} className={styles.toolText}>
        Kopiera
      </button>
      <button type="button" onClick={act("remove")} className={styles.toolDanger}>
        Ta bort
      </button>
    </div>
  );
}

/** Blocken på sidan, i den ordning återförsäljaren valt. */
export function ShopBlocks({ slug, blocks, contact, today, editing }: ShopBlocksProps) {
  if (blocks.length === 0) {
    return editing ? (
      <div className={styles.blocks} data-editing="">
        <div className={styles.dropEmpty} data-active={editing.dropIndex !== null || undefined}>
          Dra in block här — eller välj ett i panelen
        </div>
      </div>
    ) : null;
  }
  const marker = (at: number) => editing && editing.dropIndex === at && <div className={styles.dropLine} aria-hidden="true" />;
  return (
    <div className={styles.blocks} data-editing={editing ? "" : undefined}>
      {blocks.map((block, index) => (
        <Fragment key={block.id}>
          {marker(index)}
          <section
            id={block.id}
            className={styles.block}
            data-kind={block.kind}
            data-block-index={index}
            data-selected={editing?.selectedId === block.id || undefined}
            onClick={
              editing
                ? (e: MouseEvent) => {
                    // Länkar och knappar ska inte lämna förhandsvisningen.
                    if ((e.target as HTMLElement).closest("a")) e.preventDefault();
                    editing.onSelect(block.id);
                  }
                : undefined
            }
          >
            {editing && <BlockTools block={block} index={index} count={blocks.length} editing={editing} />}
            <BlockView slug={slug} block={block} contact={contact} today={today} editing={editing} />
          </section>
        </Fragment>
      ))}
      {marker(blocks.length)}
    </div>
  );
}
