"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDay } from "@/lib/format";
import { approveApplicationAction, passwordLinkAction, rejectApplicationAction, type LinkResult } from "./reseller-admin-actions";
import styles from "./admin.module.css";

type Link = Extract<LinkResult, { ok: true }>;

/** Länken som ska skickas vidare: går att kopiera eller öppna i ett färdigt mejl. Den visas bara nu. */
function LinkBox({ link, subject, body }: { link: Link; subject: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const mailto = `mailto:${link.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n${link.url}\n`)}`;
  return (
    <div className={styles.callout} data-tone="good">
      <strong>Skicka länken till {link.email}</strong>
      <span className="mono" style={{ wordBreak: "break-all" }}>
        {link.url}
      </span>
      <span>Gäller till och med {formatDay(link.expiresAt)}. Länken visas bara nu, så kopiera eller mejla den direkt.</span>
      <div className={styles.actionBar}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={async () => {
            await navigator.clipboard?.writeText(link.url).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? "Kopierad" : "Kopiera"}
        </button>
        <a href={mailto} className="btn btn--primary">
          Öppna mejl
        </a>
      </div>
    </div>
  );
}

/** Godkänn eller avslå en ansökan. Godkänd ansökan ger länken där den sökande väljer lösenord. */
export function ApplicationControls({ id, company, approved }: { id: string; company: string; approved: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const approve = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveApplicationAction(id);
      if (result.ok) setLink(result);
      else setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className={styles.form}>
      {link ? (
        <LinkBox
          link={link}
          subject="Ert konto på namnskylt.com"
          body={`Hej!\n\nAnsökan för ${company} är godkänd. Välj lösenord via länken, så är kontot klart:`}
        />
      ) : (
        <div className={styles.actionBar}>
          <button type="button" className="btn btn--primary" disabled={pending} onClick={approve}>
            {pending ? "Skapar länk…" : approved ? "Ny länk" : "Godkänn"}
          </button>
          {!approved && (
            <button
              type="button"
              className={styles.ghostButton}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Avslå ansökan från ${company}?`)) return;
                setError(null);
                startTransition(async () => {
                  const result = await rejectApplicationAction(id);
                  if (!result.ok) setError(result.error);
                  router.refresh();
                });
              }}
            >
              Avslå
            </button>
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Skapar en länk där kontots ägare väljer nytt lösenord. */
export function PasswordLinkButton({ accountId, name, email }: { accountId: string; name: string; email: string }) {
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (link) {
    return <LinkBox link={link} subject="Nytt lösenord på namnskylt.com" body={`Hej!\n\nHär är länken för att välja nytt lösenord för ${name}:`} />;
  }
  return (
    <>
      <button
        type="button"
        className={styles.ghostButton}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await passwordLinkAction(accountId, email);
            if (result.ok) setLink(result);
            else setError(result.error);
          });
        }}
      >
        {pending ? "Skapar länk…" : "Lösenordslänk"}
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </>
  );
}
