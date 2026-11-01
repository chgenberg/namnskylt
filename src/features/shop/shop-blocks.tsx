"use client";

import { useLayoutEffect, useRef, type ElementType, type KeyboardEvent, type MouseEvent } from "react";
import { isBannerActive, type Block } from "@/lib/shops/content";
import type { ShopContact } from "@/lib/shops/view";
import styles from "./shop.module.css";

export type { ShopContact };

/** Redigering i förhandsvisningen: klick väljer blocket, texten skrivs direkt i sidan. */
export interface BlockEditing {
  selectedId: string | null;
  onSelect: (blockId: string) => void;
  onText: (blockId: string, path: string, value: string) => void;
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
          {block.imageId && (
            <div className={styles.pageHeaderImage}>
              {/* eslint-disable-next-line @next/next/no-img-element -- butikens egen bild, redan komprimerad */}
              <img src={imageUrl(slug, block.imageId)} alt="" />
            </div>
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
            {block.imageId ? (
              // eslint-disable-next-line @next/next/no-img-element -- butikens egen bild, redan komprimerad
              <img src={imageUrl(slug, block.imageId)} alt={block.title} loading="lazy" />
            ) : (
              editing && <span className={styles.imageEmpty}>Välj en bild</span>
            )}
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
          {block.images.length > 0 ? (
            <div className={styles.gallery}>
              {block.images.map((imageId) => (
                // eslint-disable-next-line @next/next/no-img-element -- butikens egna bilder, redan komprimerade
                <img key={imageId} src={imageUrl(slug, imageId)} alt="" loading="lazy" />
              ))}
            </div>
          ) : (
            editing && <p className={styles.imageEmpty}>Lägg till bilder i panelen</p>
          )}
        </div>
      );
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

/** Blocken under heroen, i den ordning återförsäljaren valt. */
export function ShopBlocks({ slug, blocks, contact, today, editing }: ShopBlocksProps) {
  if (blocks.length === 0) return null;
  return (
    <div className={styles.blocks} data-editing={editing ? "" : undefined}>
      {blocks.map((block) => (
        <section
          key={block.id}
          id={block.id}
          className={styles.block}
          data-kind={block.kind}
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
          <BlockView slug={slug} block={block} contact={contact} today={today} editing={editing} />
        </section>
      ))}
    </div>
  );
}
