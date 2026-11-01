"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./editor.module.css";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Svaret ändrade sidorna — knappen ångrar just den ändringen. */
  undoable?: boolean;
  undone?: boolean;
  error?: boolean;
}

interface AiChatProps {
  messages: readonly ChatMessage[];
  pending: boolean;
  suggestions: readonly string[];
  focusLabel: string;
  onSend: (text: string) => void;
  onUndo: (messageId: string) => void;
}

/** Chatten med AI:n: skriv som till en kollega — ändringen syns direkt i utkastet. */
export function AiChat({ messages, pending, suggestions, focusLabel, onSend, onUndo }: AiChatProps) {
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const send = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2 || pending) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className={styles.chat}>
      <div ref={list} className={styles.chatList} aria-live="polite">
        {messages.length === 0 && (
          <div className={styles.chatIntro}>
            <strong>Vad vill du ändra?</strong>
            <p>Skriv som till en kollega. Jag ändrar i utkastet — inget syns för kunderna förrän du publicerar.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={styles.bubble} data-role={m.role} data-error={m.error || undefined}>
            <p>{m.text}</p>
            {m.undoable && (
              <button type="button" className={styles.bubbleAction} disabled={m.undone} onClick={() => onUndo(m.id)}>
                {m.undone ? "Ångrat" : "Ångra"}
              </button>
            )}
          </div>
        ))}
        {pending && (
          <div className={styles.bubble} data-role="assistant" aria-label="AI:n skriver">
            <span className={styles.typing}>
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className={styles.chips}>
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={pending} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className={styles.chatInput}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          value={text}
          rows={2}
          maxLength={1200}
          placeholder={`Skriv till AI:n — just nu: ${focusLabel}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <button type="submit" className={styles.send} disabled={pending || text.trim().length < 2} aria-label="Skicka">
          ↑
        </button>
      </form>
    </div>
  );
}
