"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { buildShopAction } from "./shop-actions";
import styles from "./admin.module.css";

const BUILD_EXPECTED_MS = 20_000;
const BUILD_STEPS = [
  [0, "Läser hemsidan…"],
  [25, "Hittar loggan…"],
  [50, "Väljer färger och typsnitt…"],
  [75, "Hämtar kontaktuppgifter…"],
  [90, "Bygger butiken…"],
] as const;

/** En adress in, en färdig demobutik ut — länken går att skicka direkt. */
export function ShopBuilder() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const build = () => {
    setResult(null);
    startTransition(async () => {
      const built = await buildShopAction(url);
      if (!built.ok) {
        setResult({ ok: false, text: built.error });
        return;
      }
      setResult({ ok: true, text: `Butiken för ${built.name} är klar.`, href: `/butik/${built.slug}` });
      setUrl("");
      router.refresh();
    });
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        build();
      }}
    >
      <div className={styles.scrapeRow}>
        <input
          className={styles.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="aterforsaljaren.se"
          aria-label="Återförsäljarens hemsida"
          disabled={pending}
        />
        <button type="submit" className="btn btn--primary" disabled={pending || url.trim().length < 4}>
          {pending ? "Bygger…" : "Bygg butik"}
        </button>
      </div>
      <ProgressBanner
        active={pending}
        failed={result?.ok === false}
        title="Bygger butiken"
        expectedMs={BUILD_EXPECTED_MS}
        steps={BUILD_STEPS}
        doneLabel="Butiken är klar"
      />
      {result && (
        <p className={result.ok ? styles.success : styles.error} role="status">
          {result.text}{" "}
          {result.href && (
            <a href={result.href} target="_blank" rel="noreferrer" className={styles.link}>
              Öppna butiken ↗
            </a>
          )}
        </p>
      )}
    </form>
  );
}
