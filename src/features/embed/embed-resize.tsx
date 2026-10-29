"use client";

import { useEffect } from "react";

export const EMBED_MESSAGE = "namnskylt:height";
export const EMBED_ROOT_ID = "namnskylt-embed";

/**
 * Berättar för /embed.js hur hög ramen ska vara, så att den aldrig får rullist.
 * Innehållet mäts — dokumentet är alltid minst lika högt som ramen.
 */
export function EmbedResize() {
  useEffect(() => {
    const root = document.getElementById(EMBED_ROOT_ID);
    if (window.parent === window || !root) return;
    const post = () => window.parent.postMessage({ type: EMBED_MESSAGE, height: root.getBoundingClientRect().height }, "*");
    const observer = new ResizeObserver(post);
    observer.observe(root);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
