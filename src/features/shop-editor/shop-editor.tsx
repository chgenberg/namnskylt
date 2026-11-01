"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_LABEL, MAX_PAGES, type BlockKind, type ShopContent } from "@/lib/shops/content";
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
import { AiChat, type ChatMessage } from "./ai-chat";
import { BlockForm } from "./block-form";
import { BlockList } from "./block-list";
import { BlockPalette } from "./block-palette";
import {
  aiChatAction,
  deleteImageAction,
  discardDraftAction,
  loadVersionAction,
  publishAction,
  saveDraftAction,
} from "./editor-actions";
import { isMessage, type BlockAction, type FromPreview, type ToPreview } from "./messages";
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
type Tab = "build" | "chat" | "images" | "versions";

const AUTOSAVE_MS = 1200;
const DESKTOP_PX = 1280;
const TABS: { id: Tab; label: string }[] = [
  { id: "build", label: "Bygg" },
  { id: "chat", label: "Chatt" },
  { id: "images", label: "Bilder" },
  { id: "versions", label: "Versioner" },
];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
let messageCounter = 0;
const messageId = () => `m${Date.now().toString(36)}${(messageCounter++).toString(36)}`;

export function ShopEditor({ slug, shopName, draft, published: initialPublished, versions: initialVersions, images: initialImages }: ShopEditorProps) {
  const history = useHistory(draft);
  const { content } = history;
  const [published, setPublished] = useState(initialPublished);
  const [versions, setVersions] = useState(initialVersions);
  const [images, setImages] = useState(initialImages);
  const [pageId, setPageId] = useState(draft.pages[1]?.id ?? draft.pages[0]?.id ?? "start");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<Tab>("build");
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  /** Sidorna före och efter varje AI-ändring, för chattens Ångra. */
  const aiChanges = useRef(new Map<string, { before: ShopContent; after: ShopContent }>());
  const frame = useRef<HTMLIFrameElement>(null);
  const frameBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const firstRender = useRef(true);

  const page = content.pages.find((p) => p.id === pageId) ?? content.pages[0];
  const unpublished = useMemo(() => JSON.stringify(content) !== JSON.stringify(published), [content, published]);
  const isStart = (page?.path ?? "") === "";
  const change = useCallback((next: ShopContent, key?: string) => history.change(next, key), [history]);

  /* ── Block ── */
  const addAt = useCallback(
    (kind: BlockKind, index?: number) => {
      if (!page) return;
      const result = addBlock(content, page.id, kind, index);
      if (result.blockId) {
        change(result.content);
        setSelectedId(result.blockId);
        setTab("build");
      }
    },
    [content, page, change],
  );

  const act = useCallback(
    (blockId: string, action: BlockAction) => {
      const blocks = page?.blocks ?? [];
      const index = blocks.findIndex((b) => b.id === blockId);
      if (action === "up") change(moveBlock(content, blockId, index - 1));
      else if (action === "down") change(moveBlock(content, blockId, index + 1));
      else if (action === "duplicate") {
        const result = duplicateBlock(content, blockId);
        if (result.blockId) {
          change(result.content);
          setSelectedId(result.blockId);
        }
      } else {
        change(removeBlock(content, blockId));
        if (selectedId === blockId) setSelectedId(null);
      }
    },
    [content, page, change, selectedId],
  );

  /* ── Förhandsvisningen ── */
  const sendState = useCallback(() => {
    const message: ToPreview = { type: "ns:state", content, path: page?.path ?? "", selectedId };
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [content, page?.path, selectedId]);

  useEffect(sendState, [sendState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (!isMessage<FromPreview>(event.data, ["ns:ready", "ns:select", "ns:text", "ns:page", "ns:drop", "ns:move", "ns:action"])) return;
      const data = event.data;
      switch (data.type) {
        case "ns:ready":
          sendState();
          break;
        case "ns:select":
          setSelectedId(data.blockId);
          setTab("build");
          break;
        case "ns:page": {
          const target = content.pages.find((p) => p.path === data.path);
          if (target) {
            setPageId(target.id);
            setSelectedId(null);
          }
          break;
        }
        case "ns:text":
          change(setText(content, data.blockId, data.path, data.value), `${data.blockId}.${data.path}`);
          break;
        case "ns:drop":
          addAt(data.kind, data.index);
          break;
        case "ns:move": {
          const from = page?.blocks.findIndex((b) => b.id === data.blockId) ?? -1;
          change(moveBlock(content, data.blockId, from >= 0 && from < data.index ? data.index - 1 : data.index));
          setSelectedId(data.blockId);
          break;
        }
        case "ns:action":
          act(data.blockId, data.action);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [content, page, sendState, change, addAt, act]);

  /* ── Datorvyn ritas i full bredd och skalas ner, så att den inte faller in i mobilläget ── */
  useEffect(() => {
    const box = frameBox.current;
    if (!box) return;
    const update = () => setScale(device === "desktop" ? Math.min(1, box.clientWidth / DESKTOP_PX) : 1);
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
      const result = await saveDraftAction(slug, content).catch(() => ({ ok: false as const, error: "Ingen kontakt med servern" }));
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
      if (target.closest("input, textarea, [contenteditable]") || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

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
      setPageId(result.content.pages[1]?.id ?? result.content.pages[0]?.id ?? "start");
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
      const response = await fetch(`/api/admin/shops/${slug}/images`, { method: "POST", body: form });
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

  /* ── Chatten ── */
  async function sendChat(text: string) {
    const user: ChatMessage = { id: messageId(), role: "user", text };
    const thread = [...chat.filter((m) => !m.error), user];
    setChat((all) => [...all, user]);
    setThinking(true);
    const before = content;
    const result = await aiChatAction(
      slug,
      thread.map((m) => ({ role: m.role, text: m.text })),
      before,
      { pagePath: page?.path ?? "", blockId: selectedId },
    ).catch(() => ({ ok: false as const, error: "Ingen kontakt med servern" }));
    setThinking(false);
    if (!result.ok) {
      setChat((all) => [...all, { id: messageId(), role: "assistant", text: result.error, error: true }]);
      return;
    }
    const reply: ChatMessage = { id: messageId(), role: "assistant", text: result.reply, undoable: Boolean(result.content) };
    if (result.content) {
      aiChanges.current.set(reply.id, { before, after: result.content });
      change(result.content);
      // En ny sida från AI:n ska synas direkt.
      const added = result.content.pages.find((p) => !before.pages.some((q) => q.id === p.id));
      if (added) setPageId(added.id);
      else if (!result.content.pages.some((p) => p.id === pageId)) setPageId(result.content.pages[0]?.id ?? "start");
    }
    setChat((all) => [...all, reply]);
  }

  function undoChat(id: string) {
    const entry = aiChanges.current.get(id);
    if (!entry) return;
    if (content !== entry.after && !window.confirm("Du har ändrat efter AI:ns ändring. Gå tillbaka till hur det var innan den ändå?")) return;
    change(entry.before);
    if (!entry.before.pages.some((p) => p.id === pageId)) setPageId(entry.before.pages[0]?.id ?? "start");
    setChat((all) => all.map((m) => (m.id === id ? { ...m, undone: true } : m)));
  }

  if (!page) return null;
  const selected = page.blocks.find((b) => b.id === selectedId) ?? null;
  const subpages = content.pages.slice(1);
  const focusLabel = selected ? `${BLOCK_LABEL[selected.kind]} på ${isStart ? "startsidan" : page.label}` : isStart ? "startsidan" : page.label;
  const suggestions = isStart
    ? ["Skapa en Om oss-sida om oss", "Lägg till en kontaktsida", "Skapa en sida med vanliga frågor"]
    : [`Skriv en bättre text för ${page.label}`, "Gör texterna kortare och mer säljande", "Lägg till vanliga frågor"];

  return (
    <div className={styles.editor}>
      {/* ── Verktygsrad ── */}
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Butikens sidor">
          {content.pages.map((p) => (
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
              {p.path === "" ? "🔒 Startsida" : p.label}
            </button>
          ))}
          {content.pages.length < MAX_PAGES && (
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
          <button type="button" className={styles.icon} onClick={history.undo} disabled={!history.canUndo} aria-label="Ångra" title="Ångra (⌘Z)">
            ↶
          </button>
          <button type="button" className={styles.icon} onClick={history.redo} disabled={!history.canRedo} aria-label="Gör om" title="Gör om (⇧⌘Z)">
            ↷
          </button>
          <div className={styles.segmented} role="radiogroup" aria-label="Förhandsvisning">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)}>
                {d === "desktop" ? "Dator" : "Mobil"}
              </button>
            ))}
          </div>
          <span className={styles.saveState} data-kind={save.kind} role="status">
            {save.kind === "saving" ? "Sparar…" : save.kind === "error" ? save.text : unpublished ? "Utkast sparat" : "Publicerat"}
          </span>
          {unpublished && (
            <button type="button" className={styles.ghost} onClick={discard}>
              Släng utkast
            </button>
          )}
          <a href={`/butik/${slug}${isStart ? "" : `/${page.path}`}`} target="_blank" rel="noreferrer" className={styles.ghost}>
            Visa ↗
          </a>
          <button type="button" className="btn btn--primary" onClick={publish} disabled={publishing || !unpublished || save.kind === "error"}>
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
          <div className={styles.panelTabs} role="tablist" aria-label="Verktyg">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "images" && images.length > 0 && <small>{images.length}</small>}
              </button>
            ))}
          </div>

          <div className={styles.panelBody} data-tab={tab}>
            {tab === "build" &&
              (isStart ? (
                <section className={styles.locked}>
                  <span aria-hidden="true">🔒</span>
                  <span>
                    <strong>Startsidan är densamma i alla butiker</strong>
                    <br />
                    Skylten i 3D, rubriken, skrivrutan och stegen följer er färg, logga och typsnitt — men innehållet och skyltmotorn
                    ändras inte. Bygg egna sidor med <strong>+ Sida</strong>.
                  </span>
                </section>
              ) : (
                <>
                  <section className={styles.pageSettings}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Menytext</span>
                      <input value={page.label} maxLength={30} onChange={(e) => change(renamePage(content, page.id, e.target.value), `${page.id}.label`)} />
                    </label>
                    <p className={styles.hint}>
                      namnskylt.com/butik/{slug}/<strong>{page.path}</strong>
                    </p>
                    <div className={styles.row}>
                      <button
                        type="button"
                        className={styles.ghost}
                        disabled={subpages[0]?.id === page.id}
                        onClick={() => change(movePage(content, page.id, subpages.findIndex((p) => p.id === page.id) - 1))}
                      >
                        ← I menyn
                      </button>
                      <button
                        type="button"
                        className={styles.ghost}
                        disabled={subpages.at(-1)?.id === page.id}
                        onClick={() => change(movePage(content, page.id, subpages.findIndex((p) => p.id === page.id) + 1))}
                      >
                        I menyn →
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

                  <section>
                    <h3 className={styles.sectionLabel}>Lägg till — dra in på sidan</h3>
                    <BlockPalette onAdd={(kind) => addAt(kind)} disabled={false} />
                  </section>

                  <section>
                    <h3 className={styles.sectionLabel}>På sidan</h3>
                    <BlockList
                      blocks={page.blocks}
                      selectedId={selectedId}
                      disabled={false}
                      onSelect={setSelectedId}
                      onAction={act}
                      onMove={(blockId, index) => change(moveBlock(content, blockId, index))}
                      onDrop={(kind, index) => addAt(kind, index)}
                      renderForm={(block) => (
                        <BlockForm
                          slug={slug}
                          block={block}
                          images={images}
                          uploading={uploading}
                          onUpload={upload}
                          onChange={(next, key) => change(updateBlock(content, block.id, () => next), key)}
                        />
                      )}
                    />
                  </section>
                </>
              ))}

            {tab === "chat" && (
              <AiChat messages={chat} pending={thinking} suggestions={chat.length === 0 ? suggestions : []} focusLabel={focusLabel} onSend={sendChat} onUndo={undoChat} />
            )}

            {tab === "images" && (
              <section>
                <p className={styles.hint}>Ladda upp i ett bild-, galleri- eller rubrikblock. Bilder som används på en sida går inte att ta bort.</p>
                <div className={styles.imageList}>
                  {images.length === 0 && <p className={styles.hint}>Inga bilder än.</p>}
                  {images.map((image) => (
                    <figure key={image.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- butikens egna, komprimerade bilder */}
                      <img src={`/butik/${slug}/bild/${image.id}`} alt="" loading="lazy" />
                      <button type="button" aria-label="Ta bort bilden" onClick={() => removeImage(image.id)}>
                        ✕
                      </button>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {tab === "versions" && (
              <ul className={styles.versions}>
                {versions.length === 0 && <li className={styles.hint}>Inget publicerat med editorn än.</li>}
                {versions.map((v) => (
                  <li key={v.id}>
                    <span>{formatTime(v.publishedAt)}</span>
                    <button type="button" className={styles.ghost} onClick={() => openVersion(v.id)}>
                      Öppna
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                    ? { width: DESKTOP_PX, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }
                    : undefined
                }
              />
            </div>
          </div>
          <p className={styles.hint}>
            {isStart ? "Startsidan går inte att ändra." : "Dra block hit från panelen. Klicka på ett block för att välja det — texter skrivs direkt i sidan."}
          </p>
        </div>
      </div>
    </div>
  );
}
