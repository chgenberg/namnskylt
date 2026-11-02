"use client";

import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import type { FontId } from "@/engine";
import { ShopFrame } from "@/features/shop/shop-frame";
import { ShopPageView } from "@/features/shop/shop-page-view";
import { BLOCK_KINDS, BLOCK_LABEL, findPage, type BlockKind, type ShopContent } from "@/lib/shops/content";
import type { Shop } from "@/lib/shops/model";
import { howItWorksHref, shopMenu, type ShopContact } from "@/lib/shops/view";
import { DRAG_BLOCK, DRAG_KIND, isMessage, type FromPreview, type ToPreview } from "./messages";

interface PreviewBridgeProps {
  shop: Shop;
  logoPlate: string | null;
  initial: ShopContent;
  badgeFont: FontId;
  contact: ShopContact;
  today: string;
}

function post(message: FromPreview) {
  if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
}

const isDrag = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_KIND) || e.dataTransfer.types.includes(DRAG_BLOCK);

/** Platsen ett släppt block hamnar på: före första blocket vars mitt ligger under pekaren. */
function dropIndexAt(clientY: number): number {
  const sections = [...document.querySelectorAll<HTMLElement>("[data-block-index]")];
  const index = sections.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return clientY < r.top + r.height / 2;
  });
  return index < 0 ? sections.length : index;
}

/** Butiken som den ser ut med utkastet, inne i editorns ram. */
export function PreviewBridge({ shop, logoPlate, initial, badgeFont, contact, today }: PreviewBridgeProps) {
  const [content, setContent] = useState(initial);
  const [path, setPath] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isMessage<ToPreview>(event.data, ["ns:state"])) return;
      setContent(event.data.content);
      setPath(event.data.path);
      setSelectedId(event.data.selectedId);
      document.documentElement.style.setProperty("--ui-scale", String(1 / Math.max(0.3, event.data.scale || 1)));
    };
    window.addEventListener("message", onMessage);
    post({ type: "ns:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Ett nyss valt block ska synas i ramen.
  useEffect(() => {
    if (selectedId) document.getElementById(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  const page = findPage(content, path) ?? content.pages[0];
  const isStart = (page?.path ?? "") === "";
  const menu = shopMenu(content);
  const base = `/butik/${shop.slug}`;

  /** Länkar byter sida i förhandsvisningen i stället för att lämna den. */
  function onClickCapture(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest("a[href]");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href === base) post({ type: "ns:page", path: "" });
    else if (href.startsWith(`${base}/`)) {
      const next = href.slice(base.length + 1).split(/[?#]/)[0] ?? "";
      if (content.pages.some((p) => p.path === next)) post({ type: "ns:page", path: next });
    }
  }

  const dropHandlers = isStart
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          if (!isDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_BLOCK) ? "move" : "copy";
          setDropIndex(dropIndexAt(e.clientY));
        },
        onDragLeave: (e: DragEvent) => {
          if (e.target === e.currentTarget) setDropIndex(null);
        },
        onDrop: (e: DragEvent) => {
          if (!isDrag(e)) return;
          e.preventDefault();
          const index = dropIndexAt(e.clientY);
          setDropIndex(null);
          const blockId = e.dataTransfer.getData(DRAG_BLOCK);
          const kind = e.dataTransfer.getData(DRAG_KIND);
          if (blockId) post({ type: "ns:move", blockId, index });
          else if ((BLOCK_KINDS as readonly string[]).includes(kind)) post({ type: "ns:drop", kind: kind as BlockKind, index });
        },
      };

  return (
    <div onClickCapture={onClickCapture} onSubmitCapture={(e) => e.preventDefault()} onDragEnd={() => setDropIndex(null)} {...dropHandlers}>
      <ShopFrame shop={shop} logoPlate={logoPlate} pages={menu.pages} stepsId={menu.stepsId}>
        <main>
          <ShopPageView
            slug={shop.slug}
            name={shop.profile.name}
            badgeFont={badgeFont}
            contact={contact}
            blocks={page?.blocks ?? []}
            today={today}
            howHref={howItWorksHref(content, shop.slug, true)}
            hero={isStart}
            editing={
              isStart
                ? undefined
                : {
                    selectedId,
                    dropIndex,
                    onSelect: (blockId) => post({ type: "ns:select", blockId }),
                    onText: (blockId, field, value) => post({ type: "ns:text", blockId, path: field, value }),
                    onAction: (blockId, action) => post({ type: "ns:action", blockId, action }),
                    onDragBlock: (blockId, event) => {
                      event.dataTransfer.setData(DRAG_BLOCK, blockId);
                      event.dataTransfer.effectAllowed = "move";
                    },
                    onPickImage: (blockId) => post({ type: "ns:pickImage", blockId }),
                    labelOf: (block) => BLOCK_LABEL[block.kind],
                  }
            }
          />
        </main>
      </ShopFrame>
    </div>
  );
}
