"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./quote.module.css";

/** A4 i skärmpunkter: dokumentet ritas i sin riktiga bredd och krymps till ytan. */
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;

/**
 * Offerten som den ser ut, på skyltens plats i skyltmotorn (beslut av ägaren 2026-11-19).
 * Dokumentet är samma HTML som PDF:en ritas ur (`quoteHtml`), i en ram utan skript, så att
 * det säljaren ser är det kunden får. Sidan krymps till ytans bredd.
 */
export function QuoteSheet({ html }: { html: string }) {
  const fitRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(PAGE_HEIGHT_PX);

  useEffect(() => {
    const fit = fitRef.current;
    if (!fit) return;
    const measure = () => setScale(Math.min(1, fit.clientWidth / PAGE_WIDTH_PX));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(fit);
    return () => observer.disconnect();
  }, []);

  // Dokumentet kan bli längre än en sida, till exempel med många namn: ramen följer dess höjd.
  const measureHeight = () => {
    const page = frameRef.current?.contentDocument?.documentElement;
    if (page) setHeight(Math.max(PAGE_HEIGHT_PX, page.scrollHeight));
  };

  return (
    <div className={styles.sheet}>
      <div ref={fitRef} className={styles.sheetFit}>
        <div className={styles.paper} style={{ height: height * scale, visibility: scale ? "visible" : "hidden" }}>
          <iframe
            ref={frameRef}
            className={styles.frame}
            title="Offerten som den ser ut"
            // Inga skript: dokumentet är bara en bild av offerten. Samma ursprung, så att loggornas bilder hämtas och höjden går att läsa.
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={measureHeight}
            style={{ width: PAGE_WIDTH_PX, height, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  );
}
