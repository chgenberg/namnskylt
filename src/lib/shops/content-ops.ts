import {
  MAX_BLOCKS_PER_PAGE,
  MAX_PAGES,
  newBlock,
  newPage,
  pathFor,
  type Block,
  type BlockKind,
  type ShopContent,
  type ShopPage,
} from "./content";

/** Teckengränserna per fält — samma som schemat, så att det man skriver direkt i sidan alltid går att spara. */
const LIMITS: Record<string, number> = {
  title: 80,
  label: 30,
  buttonLabel: 40,
  buttonHref: 300,
  href: 300,
  question: 140,
  answer: 600,
  "text:text": 2000,
  "text:imageText": 800,
  "text:contact": 400,
  "text:banner": 160,
  "text:steps": 280,
  lead: 300,
  url: 300,
  address: 160,
  caption: 160,
  "title:steps-item": 60,
};

export function limitFor(kind: BlockKind, path: string): number {
  const field = path.split(".").at(-1) ?? path;
  const inItem = path.startsWith("items.");
  if (field === "text") return LIMITS[`text:${kind}`] ?? 400;
  if (field === "title" && inItem) return LIMITS["title:steps-item"] ?? 60;
  return LIMITS[field] ?? 200;
}

function mapPage(content: ShopContent, pageId: string, fn: (page: ShopPage) => ShopPage): ShopContent {
  return { ...content, pages: content.pages.map((p) => (p.id === pageId ? fn(p) : p)) };
}

export function updateBlock(content: ShopContent, blockId: string, fn: (block: Block) => Block): ShopContent {
  return {
    ...content,
    pages: content.pages.map((p) => (p.blocks.some((b) => b.id === blockId) ? { ...p, blocks: p.blocks.map((b) => (b.id === blockId ? fn(b) : b)) } : p)),
  };
}

/** Skriver en text på `path` ("title", "items.2.answer") i blocket, inom fältets gräns. */
export function setText(content: ShopContent, blockId: string, path: string, value: string): ShopContent {
  return updateBlock(content, blockId, (block) => {
    const text = value.replace(/\u00a0/g, " ").slice(0, limitFor(block.kind, path));
    const [head, index, field] = path.split(".");
    if (head === "items" && index !== undefined && field && "items" in block) {
      const i = Number(index);
      const items = block.items.map((item, n) => (n === i && field in item ? { ...item, [field]: text } : item));
      return { ...block, items } as Block;
    }
    return head && head in block && head !== "kind" && head !== "id" ? ({ ...block, [head]: text } as Block) : block;
  });
}

export function addBlock(content: ShopContent, pageId: string, kind: BlockKind, at?: number): { content: ShopContent; blockId: string | null } {
  const page = content.pages.find((p) => p.id === pageId);
  if (!page || page.path === "" || page.blocks.length >= MAX_BLOCKS_PER_PAGE) return { content, blockId: null };
  const block = newBlock(kind);
  const index = at === undefined ? page.blocks.length : Math.max(0, Math.min(at, page.blocks.length));
  return { content: mapPage(content, pageId, (p) => ({ ...p, blocks: [...p.blocks.slice(0, index), block, ...p.blocks.slice(index)] })), blockId: block.id };
}

export function removeBlock(content: ShopContent, blockId: string): ShopContent {
  return { ...content, pages: content.pages.map((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== blockId) })) };
}

export function duplicateBlock(content: ShopContent, blockId: string): { content: ShopContent; blockId: string | null } {
  const page = content.pages.find((p) => p.blocks.some((b) => b.id === blockId));
  const index = page?.blocks.findIndex((b) => b.id === blockId) ?? -1;
  const source = page?.blocks[index];
  if (!page || page.path === "" || !source || page.blocks.length >= MAX_BLOCKS_PER_PAGE) return { content, blockId: null };
  const copy = { ...structuredClone(source), id: newBlock(source.kind).id } as Block;
  return {
    content: mapPage(content, page.id, (p) => ({ ...p, blocks: [...p.blocks.slice(0, index + 1), copy, ...p.blocks.slice(index + 1)] })),
    blockId: copy.id,
  };
}

/** Flyttar blocket till plats `to` på samma sida. */
export function moveBlock(content: ShopContent, blockId: string, to: number): ShopContent {
  const page = content.pages.find((p) => p.blocks.some((b) => b.id === blockId));
  if (!page) return content;
  const from = page.blocks.findIndex((b) => b.id === blockId);
  const target = Math.max(0, Math.min(to, page.blocks.length - 1));
  if (from === target) return content;
  const blocks = [...page.blocks];
  const [moved] = blocks.splice(from, 1);
  if (!moved) return content;
  blocks.splice(target, 0, moved);
  return mapPage(content, page.id, (p) => ({ ...p, blocks }));
}

export function addPage(content: ShopContent, label: string): { content: ShopContent; pageId: string | null } {
  if (content.pages.length >= MAX_PAGES) return { content, pageId: null };
  const page = newPage(label, content.pages.map((p) => p.path));
  return { content: { ...content, pages: [...content.pages, page] }, pageId: page.id };
}

/** Byter menytext; adressen följer med så länge den inte satts för hand. */
export function renamePage(content: ShopContent, pageId: string, label: string, path?: string): ShopContent {
  const others = content.pages.filter((p) => p.id !== pageId).map((p) => p.path);
  return mapPage(content, pageId, (p) =>
    p.path === "" ? { ...p, label: label.slice(0, 30) } : { ...p, label: label.slice(0, 30), path: pathFor(path ?? label, others) },
  );
}

export function removePage(content: ShopContent, pageId: string): ShopContent {
  return { ...content, pages: content.pages.filter((p) => p.id !== pageId || p.path === "") };
}

/** Undersidornas ordning i menyn; startsidan står alltid först. */
export function movePage(content: ShopContent, pageId: string, to: number): ShopContent {
  const [start, ...rest] = content.pages;
  if (!start) return content;
  const from = rest.findIndex((p) => p.id === pageId);
  if (from < 0) return content;
  const pages = [...rest];
  const [moved] = pages.splice(from, 1);
  if (!moved) return content;
  pages.splice(Math.max(0, Math.min(to, pages.length)), 0, moved);
  return { ...content, pages: [start, ...pages] };
}
