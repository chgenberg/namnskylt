"use client";

import { useReducer } from "react";
import type { ShopContent } from "@/lib/shops/content";

const MAX_STEPS = 100;
/** Bokstäver i samma fält inom den tiden blir ett steg att ångra. */
const COALESCE_MS = 1000;

interface History {
  past: ShopContent[];
  present: ShopContent;
  future: ShopContent[];
  lastKey: string | null;
  lastAt: number;
}

type Action =
  | { type: "change"; content: ShopContent; key?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; content: ShopContent };

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case "change": {
      if (action.content === state.present) return state;
      const now = Date.now();
      const coalesce = action.key !== undefined && action.key === state.lastKey && now - state.lastAt < COALESCE_MS;
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-MAX_STEPS),
        present: action.content,
        future: [],
        lastKey: action.key ?? null,
        lastAt: now,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], lastKey: null, lastAt: 0 };
    }
    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future, lastKey: null, lastAt: 0 };
    }
    case "reset":
      return { past: [], present: action.content, future: [], lastKey: null, lastAt: 0 };
  }
}

export function useHistory(initial: ShopContent) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [], lastKey: null, lastAt: 0 });
  return {
    content: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    change: (content: ShopContent, key?: string) => dispatch({ type: "change", content, key }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    reset: (content: ShopContent) => dispatch({ type: "reset", content }),
  };
}
