import type { BlockKind } from "@/lib/shops/content";

const PATHS: Record<BlockKind, string> = {
  header: "M4 6h16M4 10h10M4 15h16v4H4z",
  text: "M4 6h16M4 10h16M4 14h12M4 18h9",
  imageText: "M3 6h8v8H3zM5 12l2-2 2 2M14 7h7M14 11h7M14 15h5",
  gallery: "M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z",
  steps: "M5 7a2 2 0 1 0 0-.01M5 17a2 2 0 1 0 0-.01M10 7h10M10 17h10M5 9v6",
  faq: "M4 6h16M4 12h16M4 18h16M18 4l2 2-2 2M18 10l2 2-2 2",
  banner: "M3 9h18v6H3zM7 12h10",
  contact: "M4 6h16v12H4zM4 7l8 6 8-6",
};

export function BlockIcon({ kind }: { kind: BlockKind }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[kind]} />
    </svg>
  );
}
