"use client";

import { useEffect } from "react";
import type { NoticeTarget } from "@/lib/notices/model";
import { markNoticesReadAction } from "./notice-actions";

/**
 * Märker beskeden om det sidan visar som lästa när sidan faktiskt öppnas i
 * webbläsaren. Det görs härifrån och inte när servern ritar sidan, eftersom
 * sidor också ritas i förväg för länkar som aldrig klickas.
 */
export function NoticesSeen({ target }: { target: NoticeTarget }) {
  const key = JSON.stringify(target);
  useEffect(() => {
    void markNoticesReadAction(JSON.parse(key) as NoticeTarget);
  }, [key]);
  return null;
}
