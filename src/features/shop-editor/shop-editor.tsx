"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLOCK_KINDS,
  BLOCK_LABEL,
  MAX_PAGES,
  type Block,
  type BlockKind,
  type ShopContent,
} from "@/lib/shops/content";
import {
  addBlock,
  addPage,
  duplicateBlock,
  moveBlock,
  movePage,
  removeBlock,
  removePage,
  renamePage,
  setText,
  updateBlock,
} from "@/lib/shops/content-ops";
import type { ContentVersion, ShopImage } from "@/lib/shops/editor-repository";
import { BlockForm } from "./block-form";
import {
  aiEditAction,
  deleteImageAction,
  discardDraftAction,
  loadVersionAction,
  publishAction,
  saveDraftAction,
} from "./editor-actions";
import { isMessage, type FromPreview, type ToPreview } from "./messages";
import { useHistory } from "./use-history";
import styles from "./editor.module.css";

interface ShopEditorProps {
  slug: string;
  shopName: string;
  draft: ShopContent;
  published: ShopContent;
  versions: ContentVersion[];
  images: ShopImage[];
}

type SaveState = { kind: "saved" } | { kind: "saving" } | { kind: "error"; text: string };
type Device = "desktop" | "mobile";

const BLOCK_HINT: Record<BlockKind, string> = {
  header: "Stor rubrik med ingress och bild",
  text: "Rubrik och text — t.ex. Om oss",
  imageText: "En bild bredvid text och knapp",
  gallery: "Bilder på skyltar ni gjort",
  steps: "Hur det går till, steg för steg",
  faq: "Frågor och svar som fälls ut",
  banner: "Kampanj eller nyhet i butikens färg",
  contact: "Era kontaktuppgifter och en mejlknapp",
};

const AUTOSAVE_MS = 1200;
const DESKTOP_PX = 1280;
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function blockSummary(block: Block): string {
  const title =
    "title" in block && block.title ? block.title : "text" in block && block.text ? block.text : "";
  return title.split("\n")[0]?.slice(0, 48) ?? "";
}

export function ShopEditor({
  slug,
  shopName,
  draft,
  published: initialPublished,
  versions: initialVersions,
  images: initialImages,
}: ShopEditorProps) {
  const history = useHistory(draft);
  const { content } = history;
  const [published, setPublished] = useState(initialPublished);
  const [versions, setVersions] = useState(initialVersions);
  const [images, setImages] = useState(initialImages);
  const [pageId, setPageId] = useState(draft.pages[0]?.id ?? "start");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ai, setAi] = useState<{
    wish: string;
    pending: boolean;
    proposal: ShopContent | null;
    summary: string;
    error: string | null;
  }>({
    wish: "",
    pending: false,
    proposal: null,
    summary: "",
    error: null,
  });
  const frame = useRef<HTMLIFrameElement>(null);
  const frameBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const firstRender = useRef(true);

  const shown = ai.proposal ?? content;
  const page = shown.pages.find((p) => p.id === pageId) ?? shown.pages[0];
  const unpublished = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(published),
    [content, published],
  );

  /* ── Förhandsvisningen ── */
  const sendState = useCallback(() => {
    const message: ToPreview = {
      type: "ns:state",
      content: shown,
      path: page?.path ?? "",
      selectedId,
    };
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [shown, page?.path, selectedId]);

  useEffect(sendState, [sendState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      if (!isMessage<FromPreview>(event.data, ["ns:ready", "ns:select", "ns:text", "ns:page"]))
        return;
      const data = event.data;
      if (data.type === "ns:ready") sendState();
      else if (data.type === "ns:select") setSelectedId(data.blockId);
      else if (data.type === "ns:page") {
        const target = content.pages.find((p) => p.path === data.path);
        if (target) {
          setPageId(target.id);
          setSelectedId(null);
        }
      } else if (data.type === "ns:text" && !ai.proposal) {
        history.change(
          setText(content, data.blockId, data.path, data.value),
          `${data.blockId}.${data.path}`,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [content, sendState, history, ai.proposal]);

  /* ── Datorvyn ritas i full bredd och skalas ner, så att den inte faller in i mobilläget ── */
  useEffect(() => {
    const box = frameBox.current;
    if (!box) return;
    const update = () =>
      setScale(device === "desktop" ? Math.min(1, box.clientWidth / DESKTOP_PX) : 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [device]);

  /* ── Utkastet sparas av sig självt ── */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSave({ kind: "saving" });
    const timer = setTimeout(async () => {
      const result = await saveDraftAction(slug, content).catch(() => ({
        ok: false as const,
        error: "Ingen kontakt med servern",
      }));
      setSave(result.ok ? { kind: "saved" } : { kind: "error", text: result.error });
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [content, slug]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (save.kind === "saving") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.kind]);

  /* ── Ångra med tangentbordet, utanför textfälten ── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("input, textarea, [contenteditable]") ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z"
      )
        return;
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  const change = (next: ShopContent, key?: string) => {
    if (ai.proposal) return;
    history.change(next, key);
  };

  async function publish() {
    setPublishing(true);
    setNotice(null);
    const result = await publishAction(slug, content);
    setPublishing(false);
    if (result.ok) {
      setPublished(content);
      setVersions(result.versions);
      setNotice({ ok: true, text: "Publicerat — butiken visar ändringarna nu" });
    } else setNotice({ ok: false, text: result.error });
  }

  async function discard() {
    if (!window.confirm("Släng alla ändringar sedan senaste publiceringen?")) return;
    const result = await discardDraftAction(slug);
    if (result.ok) {
      history.reset(result.content);
      setPageId(result.content.pages[0]?.id ?? "start");
      setSelectedId(null);
    }
  }

  async function openVersion(id: number) {
    const result = await loadVersionAction(slug, id);
    if (result.ok) {
      change(result.content);
      setNotice({ ok: true, text: "Versionen är öppnad som utkast — publicera för att visa den" });
    }
  }

  async function upload(file: File): Promise<ShopImage | null> {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/admin/shops/${slug}/images`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as ShopImage & { error?: string };
      if (!response.ok) {
        setNotice({ ok: false, text: body.error ?? "Bilden gick inte att ladda upp" });
        return null;
      }
      setImages((all) => [body, ...all]);
      return body;
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(id: string) {
    const result = await deleteImageAction(slug, id, content);
    if (result.ok) setImages((all) => all.filter((i) => i.id !== id));
    else setNotice({ ok: false, text: result.error });
  }

  async function askAi() {
    setAi((s) => ({ ...s, pending: true, error: null }));
    const result = await aiEditAction(slug, ai.wish, content).catch(() => ({
      ok: false as const,
      error: "Ingen kontakt med servern",
    }));
    if (result.ok) {
      setAi((s) => ({ ...s, pending: false, proposal: result.content, summary: result.summary }));
      if (!result.content.pages.some((p) => p.id === pageId))
        setPageId(result.content.pages[0]?.id ?? "start");
    } else setAi((s) => ({ ...s, pending: false, error: result.error }));
  }

  const acceptAi = () => {
    if (!ai.proposal) return;
    history.change(ai.proposal);
    setAi({ wish: "", pending: false, proposal: null, summary: "", error: null });
  };

  if (!page) return null;
  const isStart = page.path === "";
  const selected = page.blocks.find((b) => b.id === selectedId) ?? null;
  const subpages = content.pages.slice(1);

  return (
    <div className={styles.editor}>
      {/* ── Verktygsrad ── */}
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Butikens sidor">
          {shown.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === page.id}
              className={styles.tab}
              onClick={() => {
                setPageId(p.id);
                setSelectedId(null);
              }}
            >
              {p.path === "" ? "Startsida" : p.label}
            </button>
          ))}
          {content.pages.length < MAX_PAGES && !ai.proposal && (
            <button
              type="button"
              className={styles.tabAdd}
              onClick={() => {
                const label = window.prompt("Vad ska sidan heta i menyn?", "Om oss");
                if (!label?.trim()) return;
                const result = addPage(content, label.trim());
                if (result.pageId) {
                  change(result.content);
                  setPageId(result.pageId);
                  setSelectedId(null);
                }
              }}
            >
              + Sida
            </button>
          )}
        </div>
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.icon}
            onClick={history.undo}
            disabled={!history.canUndo || Boolean(ai.proposal)}
            aria-label="Ångra"
            title="Ångra (⌘Z)"
          >
            ↶
          </button>
          <button
            type="button"
            className={styles.icon}
            onClick={history.redo}
            disabled={!history.canRedo || Boolean(ai.proposal)}
            aria-label="Gör om"
            title="Gör om (⇧⌘Z)"
          >
            ↷
          </button>
          <div className={styles.segmented} role="radiogroup" aria-label="Förhandsvisning">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={device === d}
                onClick={() => setDevice(d)}
              >
                {d === "desktop" ? "Dator" : "Mobil"}
              </button>
            ))}
          </div>
          <span className={styles.saveState} data-kind={save.kind} role="status">
            {save.kind === "saving"
              ? "Sparar utkast…"
              : save.kind === "error"
                ? save.text
                : unpublished
                  ? "Utkast sparat"
                  : "Publicerat"}
          </span>
          {unpublished && (
            <button type="button" className={styles.ghost} onClick={discard}>
              Släng utkast
            </button>
          )}
          <a
            href={`/butik/${slug}${isStart ? "" : `/${page.path}`}`}
            target="_blank"
            rel="noreferrer"
            className={styles.ghost}
          >
            Visa butiken ↗
          </a>
          <button
            type="button"
            className="btn btn--primary"
            onClick={publish}
            disabled={publishing || !unpublished || Boolean(ai.proposal) || save.kind === "error"}
          >
            {publishing ? "Publicerar…" : "Publicera"}
          </button>
        </div>
      </div>
      {notice && (
        <p className={styles.notice} data-ok={notice.ok || undefined} role="status">
          {notice.text}
          <button type="button" aria-label="Stäng" onClick={() => setNotice(null)}>
            ✕
          </button>
        </p>
      )}

      <div className={styles.body}>
        {/* ── Panel ── */}
        <aside className={styles.panel} aria-label={`Redigera ${shopName}`}>
          <section className={styles.ai}>
            <label className={styles.fieldLabel} htmlFor="ai-wish">
              Be AI:n ändra sidorna
            </label>
            <textarea
              id="ai-wish"
              rows={2}
              value={ai.wish}
              maxLength={1000}
              placeholder="T.ex. Lägg till en Om oss-sida och vanliga frågor om leveranstid"
              disabled={ai.pending || Boolean(ai.proposal)}
              onChange={(e) => setAi((s) => ({ ...s, wish: e.target.value }))}
            />
            {ai.proposal ? (
              <div className={styles.aiProposal}>
                <p>
                  <strong>Förslag:</strong> {ai.summary} Det syns i förhandsvisningen.
                </p>
                <div className={styles.row}>
                  <button type="button" className="btn btn--primary" onClick={acceptAi}>
                    Använd
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => setAi((s) => ({ ...s, proposal: null, summary: "" }))}
                  >
                    Släng
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={askAi}
                  disabled={ai.pending || ai.wish.trim().length < 3}
                >
                  {ai.pending ? "Tänker…" : "Föreslå ändringar"}
                </button>
                {ai.error && <span className={styles.error}>{ai.error}</span>}
              </div>
            )}
          </section>

          {!isStart && !ai.proposal && (
            <section className={styles.pageSettings}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Menytext</span>
                <input
                  value={page.label}
                  maxLength={30}
                  onChange={(e) =>
                    change(renamePage(content, page.id, e.target.value), `${page.id}.label`)
                  }
                />
              </label>
              <p className={styles.hint}>
                Adress: /butik/{slug}/<strong>{page.path}</strong>
              </p>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={subpages[0]?.id === page.id}
                  onClick={() =>
                    change(
                      movePage(content, page.id, subpages.findIndex((p) => p.id === page.id) - 1),
                    )
                  }
                >
                  ← Tidigare i menyn
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={subpages.at(-1)?.id === page.id}
                  onClick={() =>
                    change(
                      movePage(content, page.id, subpages.findIndex((p) => p.id === page.id) + 1),
                    )
                  }
                >
                  Senare →
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    if (!window.confirm(`Ta bort sidan ${page.label}?`)) return;
                    change(removePage(content, page.id));
                    setPageId(content.pages[0]?.id ?? "start");
                  }}
                >
                  Ta bort sidan
                </button>
              </div>
            </section>
          )}

          {isStart ? (
            <section className={styles.locked}>
              <span aria-hidden="true">🔒</span>
              <span>
                <strong>Startsidan är densamma i alla butiker</strong>
                <br />
                Skylten i 3D, rubriken, skrivrutan och stegen. Den följer er färg, logga och
                typsnitt — men innehållet ändras inte, och skyltmotorn bakom den är densamma för
                alla. Lägg egna sidor med + Sida.
              </span>
            </section>
          ) : (
            <section>
              <ol className={styles.blocks} aria-label="Sidans block">
                {page.blocks.map((block, index) => (
                  <li
                    key={block.id}
                    className={styles.blockRow}
                    data-selected={block.id === selectedId || undefined}
                    data-dragging={dragId === block.id || undefined}
                    draggable={!ai.proposal}
                    onDragStart={() => setDragId(block.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragId && dragId !== block.id) change(moveBlock(content, dragId, index));
                    }}
                  >
                    <button
                      type="button"
                      className={styles.blockHead}
                      onClick={() => setSelectedId(block.id === selectedId ? null : block.id)}
                      aria-expanded={block.id === selectedId}
                    >
                      <span className={styles.grip} aria-hidden="true">
                        ⋮⋮
                      </span>
                      <span>
                        <strong>{BLOCK_LABEL[block.kind]}</strong>
                        <small>{blockSummary(block)}</small>
                      </span>
                    </button>
                    {!ai.proposal && (
                      <span className={styles.itemActions}>
                        <button
                          type="button"
                          aria-label="Flytta upp"
                          disabled={index === 0}
                          onClick={() => change(moveBlock(content, block.id, index - 1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Flytta ner"
                          disabled={index === page.blocks.length - 1}
                          onClick={() => change(moveBlock(content, block.id, index + 1))}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label="Kopiera"
                          onClick={() => {
                            const result = duplicateBlock(content, block.id);
                            if (result.blockId) {
                              change(result.content);
                              setSelectedId(result.blockId);
                            }
                          }}
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          aria-label="Ta bort"
                          onClick={() => {
                            change(removeBlock(content, block.id));
                            if (selectedId === block.id) setSelectedId(null);
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    )}
                    {block.id === selectedId && selected && !ai.proposal && (
                      <div className={styles.blockForm}>
                        <BlockForm
                          slug={slug}
                          block={selected}
                          images={images}
                          uploading={uploading}
                          onUpload={upload}
                          onChange={(next, key) =>
                            change(
                              updateBlock(content, block.id, () => next),
                              key,
                            )
                          }
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {!ai.proposal &&
                (adding ? (
                  <div className={styles.addGrid}>
                    {BLOCK_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          const result = addBlock(content, page.id, kind);
                          if (result.blockId) {
                            change(result.content);
                            setSelectedId(result.blockId);
                          }
                          setAdding(false);
                        }}
                      >
                        <strong>{BLOCK_LABEL[kind]}</strong>
                        <small>{BLOCK_HINT[kind]}</small>
                      </button>
                    ))}
                    <button type="button" className={styles.ghost} onClick={() => setAdding(false)}>
                      Avbryt
                    </button>
                  </div>
                ) : (
                  <button type="button" className={styles.add} onClick={() => setAdding(true)}>
                    + Lägg till block
                  </button>
                ))}
            </section>
          )}

          <details className={styles.more}>
            <summary>Bilder ({images.length})</summary>
            <div className={styles.imageList}>
              {images.length === 0 && (
                <p className={styles.hint}>
                  Inga bilder än. Ladda upp i ett bild- eller galleriblock.
                </p>
              )}
              {images.map((image) => (
                <figure key={image.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- butikens egna, komprimerade bilder */}
                  <img src={`/butik/${slug}/bild/${image.id}`} alt="" loading="lazy" />
                  <button
                    type="button"
                    aria-label="Ta bort bilden"
                    onClick={() => removeImage(image.id)}
                  >
                    ✕
                  </button>
                </figure>
              ))}
            </div>
          </details>

          <details className={styles.more}>
            <summary>Tidigare versioner ({versions.length})</summary>
            <ul className={styles.versions}>
              {versions.length === 0 && (
                <li className={styles.hint}>Inget publicerat med editorn än.</li>
              )}
              {versions.map((v) => (
                <li key={v.id}>
                  <span>{formatTime(v.publishedAt)}</span>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => openVersion(v.id)}
                    disabled={Boolean(ai.proposal)}
                  >
                    Öppna
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </aside>

        {/* ── Förhandsvisning ── */}
        <div className={styles.stage} data-device={device}>
          <div className={styles.frameWrap}>
            <div className={styles.frameBar}>
              <i />
              <i />
              <i />
              <span>
                namnskylt.com/butik/{slug}
                {isStart ? "" : `/${page.path}`}
              </span>
            </div>
            <div ref={frameBox} className={styles.frameBox}>
              <iframe
                ref={frame}
                src={`/forhandsvisning/${slug}`}
                title="Förhandsvisning av butiken"
                className={styles.frame}
                onLoad={sendState}
                style={
                  device === "desktop"
                    ? {
                        width: DESKTOP_PX,
                        height: `${100 / scale}%`,
                        transform: `scale(${scale})`,
                        transformOrigin: "0 0",
                      }
                    : undefined
                }
              />
            </div>
          </div>
          <p className={styles.hint}>
            {isStart
              ? "Startsidan går inte att ändra."
              : "Klicka på ett block för att välja det. Texter går att skriva direkt i sidan."}
          </p>
        </div>
      </div>
    </div>
  );
}
