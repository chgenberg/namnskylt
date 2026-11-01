"use client";

import { useEffect, useState, type MouseEvent } from "react";
import type { FontId } from "@/engine";
import { ShopFrame } from "@/features/shop/shop-frame";
import { ShopPageView } from "@/features/shop/shop-page-view";
import { findPage, type ShopContent } from "@/lib/shops/content";
import type { Shop } from "@/lib/shops/model";
import { howItWorksHref, shopMenu, type ShopContact } from "@/lib/shops/view";
import { isMessage, type FromPreview, type ToPreview } from "./messages";

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

/** Butiken som den ser ut med utkastet, inne i editorns ram. */
export function PreviewBridge({ shop, logoPlate, initial, badgeFont, contact, today }: PreviewBridgeProps) {
  const [content, setContent] = useState(initial);
  const [path, setPath] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isMessage<ToPreview>(event.data, ["ns:state"])) return;
      setContent(event.data.content);
      setPath(event.data.path);
      setSelectedId(event.data.selectedId);
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

  return (
    <div onClickCapture={onClickCapture} onSubmitCapture={(e) => e.preventDefault()}>
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
            hero={(page?.path ?? "") === ""}
            editing={(page?.path ?? "") === "" ? undefined : {
              selectedId,
              onSelect: (blockId) => post({ type: "ns:select", blockId }),
              onText: (blockId, field, value) => post({ type: "ns:text", blockId, path: field, value }),
            }}
          />
        </main>
      </ShopFrame>
    </div>
  );
}
