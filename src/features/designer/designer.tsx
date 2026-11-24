"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePriceList } from "@/components/price-list-provider";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  MAX_ORDER_BADGES,
  createBadgeDocument,
  getColor,
  getMaterial,
  batchLine,
  groupBadges,
  layoutBadge,
  parseBatchInput,
  quantityForNames,
  removeBatchEntry,
  replaceBatchEntry,
  parseSmartInput,
  tierIndexFor,
  toOfferedDocument,
  withLeadName,
  withTexts,
  type BadgeDocument,
  type BadgeGroup,
  type FontId,
} from "@/engine";
import { useFontEngine } from "@/hooks/use-font-engine";
import type { CustomerAccountView } from "@/lib/customer-auth/model";
import { WEB_SCOPE } from "@/lib/designer-stats/model";
import { COPY_MARK_PARAM, openedWith, openedWithCopy, savedWorkKey, type RestoredWork } from "@/lib/designer-work/model";
import { designSums } from "@/lib/shops/price-list";
import { useVisualize } from "@/features/visualize/use-visualize";
import { VisualizeView } from "@/features/visualize/visualize-view";
import { BadgeEditor } from "./badge-editor";
import { CartAccount } from "./cart-account";
import { CartButton } from "./cart-button";
import { CartDrawer } from "./cart-drawer";
import cartStyles from "./cart.module.css";
import { CustomerQuotePanel } from "./quote/customer-quote-panel";
import { QuotePanel } from "./quote/quote-panel";
import { QuoteRail } from "./quote/quote-rail";
import { QuoteSheet } from "./quote/quote-sheet";
import { QuoteShots } from "./quote/quote-shots";
import { useQuote } from "./quote/use-quote";
import type { CustomerTarget } from "./sections/reseller-customer";
import { SectionNav } from "./section-nav";
import styles from "./designer.module.css";
import { BatchSection } from "./sections/batch-section";
import { CartList } from "./sections/cart-section";
import { FormatSection } from "./sections/format-section";
import { LogoSection } from "./sections/logo-section";
import { MarkingSection } from "./sections/marking-section";
import { MaterialSection } from "./sections/material-section";
import { MountingSection } from "./sections/mounting-section";
import { OrderSection } from "./sections/order-section";
import { TextSection } from "./sections/text-section";
import type { SpinFocus } from "./badge-3d";
import type { BadgeRecorder } from "./three/recorder";
import { videoFileName } from "./video-file";
import { OnboardingDialog } from "./onboarding-dialog";
import type { OrderCopy, ResellerOrderContext, ShopContext } from "./reseller";
import { designerReducer, type DesignerAction } from "./state";
import { isChoice, useDesignerSteps } from "./use-designer-steps";
import { useSavedWork } from "./use-saved-work";

const Badge3D = dynamic(() => import("./badge-3d"), {
  ssr: false,
  loading: () => (
    <div className={styles.loading}>
      <ProgressBanner
        variant="floating"
        active
        title="3D-vy"
        expectedMs={LOAD_3D_EXPECTED_MS}
        steps={LOAD_3D_STEPS}
      />
    </div>
  ),
});

/** `quote` är offerten på skyltens plats. Den öppnas med knappen Offert, inte med vyväljaren. */
type View = "3d" | "drawing" | "person" | "quote";

/** Fältet för skyltens första rad i panelen (`TextSection`). Dit ställs markören när skylten saknar namn. */
const FIRST_ROW_LABEL = "Rad 1";
/** Om fältet syns: mitt på det ligger inget annat, och det är inte bortrullat ur panelen. */
function isShown(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element;
}
/**
 * Ställer markören i skyltens första rad. Texten står efter material och form i panelen, och
 * webbläsaren rullar annars själv fram fältet: då hamnar det mitt i panelen, med material och form
 * utanför bild. Panelen står därför still, så att den börjar på material, och textens sektion
 * rullas fram först när något skrivs i fältet. Med `reveal` rullas den fram direkt, för den som
 * redan har valt material och form.
 */
function focusFirstRow({ onlyEmpty = false, reveal = false }: { onlyEmpty?: boolean; reveal?: boolean } = {}): void {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${FIRST_ROW_LABEL}"]`);
  if (!input || (onlyEmpty && input.value.trim() !== "")) return;
  // Utan mjuk rullning (globals.css): nästa tecken avbryter annars rullningen halvvägs.
  const show = () => input.closest("section")?.scrollIntoView({ block: "start", behavior: "instant" });
  if (reveal) show();
  else {
    // Läget läses innan tecknet skrivs: webbläsaren rullar själv fram markören, men bara till panelens kant.
    const showIfHidden = () => {
      if (!isShown(input)) requestAnimationFrame(show);
    };
    input.addEventListener("beforeinput", showIfHidden, { once: true });
  }
  input.focus({ preventScroll: true });
}
/** Ordern är lagd: `igen` tas ur adressen, så att en omladdning inte öppnar samma order i varukorgen en gång till. */
function forgetReorderInAddress(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("igen")) return;
  url.searchParams.delete("igen");
  url.searchParams.delete(COPY_MARK_PARAM);
  window.history.replaceState(window.history.state, "", url);
}
const noPhotoProgress = () => {};
/** Ett varv runt skylten i 3D-filmen. */
const VIDEO_SECONDS = 6;
/** Så länge väntar filmen på att 3D-vyn ska ritas, när den startas från Ritning eller På person. */
const RECORDER_WAIT_MS = 6000;
/** 3D-vyn tonas in innan filmen börjar, så att första bildrutan inte är halvgenomskinlig. */
const VIEW_SETTLE_MS = 700;
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const VIDEO_STEPS = [
  [0, "Spelar in ett varv runt skylten…"],
  [85, "Sparar filmen…"],
] as const;
const LOAD_3D_EXPECTED_MS = 2_500;
const LOAD_3D_STEPS = [
  [0, "Laddar 3D-motorn…"],
  [55, "Fräser gravyren…"],
] as const;

const VIEW_OPTIONS = [
  { id: "3d", label: "3D" },
  { id: "drawing", label: "Ritning" },
  { id: "person", label: "På person" },
] as const;

interface DesignerProps {
  initialText: string;
  /** En delad skylt från länken — vinner över texten. */
  initialDoc?: BadgeDocument | null;
  /** Återförsäljaren beställer åt en kund — ordern läggs direkt på kunden. */
  reseller?: ResellerOrderContext;
  shop?: ShopContext;
  /** Butikens gravyrtypsnitt — det som liknar deras sajt mest. */
  initialFont?: FontId;
  /** Privatpersoner kan betala med kort i kassan. */
  cardPayments?: boolean;
  /**
   * Besöket kommer från startsidans ruta, med eller utan namn. Då visas
   * startrutan för material och form även när skylten saknar text, och namnet
   * skrivs i editorn efteråt.
   */
  fromStart?: boolean;
  /**
   * Kundkonton finns här: inloggningen visas högst upp i varukorgen, och
   * kassan erbjuder ett konto. Av utan databas.
   */
  accounts?: boolean;
  /** Kunden som är inloggad när sidan öppnas. Kassan fylls i med kontots uppgifter. */
  customer?: CustomerAccountView | null;
  /** En av den inloggade kundens tidigare ordrar, öppnad med "Kopiera order": dess skyltar ligger i varukorgen. */
  reorder?: OrderCopy;
  /** Kopians märke ur adressen (`copyMarkOf`): varje klick på "Kopiera order" är en egen öppning. */
  copyMark?: string;
  /**
   * En slutkund kan göra en offert själv och ladda ner den, med knappen Offert (besked av ägaren
   * 2026-11-20). Av utan databas, och i en butik som bara är en förhandsvisning.
   */
  customerQuote?: boolean;
}

export function Designer({
  initialText,
  initialDoc,
  reseller,
  shop,
  initialFont,
  cardPayments,
  fromStart = false,
  accounts = false,
  customer = null,
  reorder,
  copyMark,
  customerQuote = false,
}: DesignerProps) {
  /**
   * En tidigare order som kopieras till en ny, av återförsäljaren åt en kund eller av kunden själv
   * med "Kopiera order": dess designer ligger i varukorgen från början. Den gamla ordern ändras aldrig.
   */
  const opened = reseller?.copy ?? reorder;
  const copy = opened && opened.groups.length > 0 ? opened : null;
  /** Kunden som är inloggad. Byts när kunden loggar in eller ut i varukorgen, eller skapar konto i kassan. */
  const [account, setAccount] = useState<CustomerAccountView | null>(customer);
  /** Ordern som beställs igen. Gäller den första ordern som läggs, inte nästa. */
  const [repeatOf, setRepeatOf] = useState<string | null>(() => (!reseller && reorder ? reorder.orderNo : null));
  const [doc, dispatch] = useReducer(designerReducer, initialText, (text) => {
    // En delad eller äldre skylt kan bära ett material eller mått som inte säljs längre.
    if (initialDoc) return toOfferedDocument(initialDoc);
    // Editorn börjar på en ny skylt med samma design som den sista i ordern, utan text.
    const last = copy?.groups.at(-1);
    if (last) return { ...withTexts(last.doc, [""]), quantity: 1 };
    const created = createBadgeDocument(parseSmartInput(text));
    return initialFont ? { ...created, font: initialFont } : created;
  });
  const [view, setView] = useState<View>("3d");
  const [onboarding, setOnboarding] = useState(() => !initialDoc && (initialText.trim() !== "" || (fromStart && !reseller)));
  const [focus, setFocus] = useState<SpinFocus | null>(null);
  /** Skylten graveras fram en gång när designern öppnas, och igen efter startrutan. */
  const [engrave, setEngrave] = useState<number | null>(0);
  const fonts = useFontEngine();
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [stageNote, setStageNote] = useState<string | null>(null);
  const visualize = useVisualize(doc);
  const [batchText, setBatchText] = useState("");
  /** Designer som redan ligger i ordern, utöver skylten i editorn. */
  const [cart, setCart] = useState<BadgeGroup[]>(() => copy?.groups ?? []);
  /** Skylten i editorn är ny och orörd efter "lägg till": den räknas inte in i ordern förrän den ändrats. */
  const [pending, setPending] = useState(() => Boolean(copy));
  /** Stillbilden av designen som ensam ligger i varukorgen, tagen när den lades dit. */
  const cartShot = useRef<string | null>(null);
  /**
   * Varukorgen öppnas med symbolen längst upp till höger, och därifrån skickas ordern eller
   * offerten (besked av ägaren 2026-11-17). En öppnad order börjar i varukorgen.
   */
  const [cartOpen, setCartOpen] = useState(() => Boolean(copy));
  /** Kunden har just beställt: kvittot står kvar i varukorgen tills nästa skylt läggs dit. */
  const [ordered, setOrdered] = useState(false);
  /** Kassan börjar om från början efter en lagd order. */
  const [checkoutRound, setCheckoutRound] = useState(0);
  /**
   * Skylten kunden just beställde. Den visas i 3D tills kunden börjar på nästa skylt (besked av ägaren
   * 2026-11-24: efter ordern visades en tom skylt, "precis som att den påbörjar en ny order"). En order
   * med flera designer visar den senast tillagda, som varukorgen gör.
   */
  const [orderedDoc, setOrderedDoc] = useState<BadgeDocument | null>(null);
  /** Platsen i sidhuvudet där varukorgens symbol sitter. Utan sidhuvud ligger symbolen fast över sidan. */
  const [cartSlot, setCartSlot] = useState<{ element: Element | null } | null>(null);
  useEffect(() => {
    setCartSlot({ element: document.querySelector("[data-cart-slot]") });
  }, []);
  /** Det skyltmotorn öppnades med. Dit går "Börja om", och mot det jämförs det som är sparat i webbläsaren. */
  const [opening] = useState(() => ({
    doc,
    fromAddress: Boolean(initialDoc) || initialText.trim() !== "",
    // En kopierad order är sin egen öppning: laddas sidan om kommer ändringarna tillbaka, annars ersätter
    // den det sparade. Varje klick på "Kopiera order" har sitt eget märke och börjar från ordern som den lades.
    opened: copy ? openedWithCopy(copy.orderNo, copyMark) : openedWith(initialText, initialDoc),
    storageKey: savedWorkKey(
      reseller
        ? // Utan förvald kund har säljaren en egen varukorg, som blir en order eller offert när kunden är vald.
          { kind: "reseller", customerId: reseller.customerId ?? "valfri" }
        : shop
          ? { kind: "shop", slug: shop.slug }
          : { kind: "web" },
    ),
  }));
  const work = useMemo(() => ({ doc, batchText, cart, pending, opened: opening.opened }), [doc, batchText, cart, pending, opening.opened]);
  /** Rutorna som stängdes när det sparade lästes tillbaka. "Börja om" öppnar dem igen. */
  const closedByRestore = useRef({ onboarding: false });
  /** Varukorgen och skylten sparas i webbläsaren och kommer tillbaka när sidan öppnas igen. */
  const saved = useSavedWork({
    storageKey: opening.storageKey,
    replaces: Boolean(copy),
    incoming: opening.fromAddress ? opening.doc : null,
    work,
    onRestore: ({ work: restored, editor }: RestoredWork) => {
      dispatch({ type: "load", doc: restored.doc });
      setBatchText(restored.batchText);
      setCart(restored.cart);
      setPending(restored.pending);
      // Skylten i editorn är kundens egen sedan förut: då behövs varken startrutan eller valen en gång till.
      if (editor === "saved") {
        closedByRestore.current = { onboarding };
        setOnboarding(false);
      }
    },
  });
  /** Hur långt besöket kommer i skyltmotorn. En återförsäljare som lägger en order åt en kund är inget besök. */
  const { report: track, visitId } = useDesignerSteps(reseller ? null : (shop?.slug ?? WEB_SCOPE));
  const hasText = doc.rows.some((row) => row.text.trim() !== "");
  useEffect(() => track("open"), [track]);
  useEffect(() => {
    if (hasText) track("text");
  }, [hasText, track]);
  const cartBadges = useMemo(() => cart.flatMap((group) => groupBadges(group)), [cart]);
  /**
   * Skylten som visas i 3D när allt som är designat ligger i varukorgen: den senast tillagda.
   * Skylten i editorn är då ny och tom, och förut var det den som syntes bakom varukorgen
   * (besked av ägaren 2026-11-20: "när jag klickar på varukorg så blir skylten tom, namnet
   * försvinner"). Så fort nästa skylt påbörjas visas den i stället.
   */
  const shownFromCart = pending && cart.length > 0 ? (cart[cart.length - 1]?.doc ?? null) : null;
  const stageDoc = shownFromCart ?? orderedDoc ?? doc;
  const batchEntries = useMemo(() => parseBatchInput(batchText, Infinity), [batchText]);
  const batch = useMemo(
    // Ordern rymmer MAX_ORDER_BADGES skyltar, med dem som redan ligger där inräknade.
    () => batchEntries.slice(0, Math.max(0, MAX_ORDER_BADGES - cartBadges.length - 1)).map((texts) => withTexts(doc, texts)),
    [batchEntries, doc, cartBadges.length],
  );
  const orderBadges = useMemo(() => (pending ? cartBadges : [...cartBadges, doc, ...batch]), [pending, cartBadges, doc, batch]);
  const priceList = usePriceList();
  /**
   * Offerten på skyltens plats (knappen Offert, beslut av ägaren 2026-11-19). Den gäller varukorgen och
   * skylten i editorn. Stillbilden tas när vyn öppnas, medan skylten syns, och bara för en enda design.
   */
  const [quoteShot, setQuoteShot] = useState<string | null>(null);
  const finishQuote = () => {
    // Offerten är sparad: varukorgen och skylten börjar om, som efter en lagd order.
    cartShot.current = null;
    setQuoteShot(null);
    setCart([]);
    setBatchText("");
    dispatch({ type: "load", doc: { ...withTexts(doc, [""]), quantity: 1 } });
    setPending(true);
    saved.finish();
  };
  /** Kunden gör sin egen offert. Den som är inloggad i panelen gör den åt en kund, som förut. */
  const selfQuote = customerQuote && !reseller;
  const quote = useQuote({
    reseller,
    self: selfQuote,
    shop,
    account,
    badges: orderBadges,
    priceList,
    fonts,
    active: view === "quote",
    badgeShot: quoteShot,
    onSaved: finishQuote,
  });
  const openQuote = () => {
    const designs = cart.length + (pending ? 0 : 1);
    // En design som redan ligger i varukorgen har sin bild därifrån. Skylten i editorn fotograferas nu.
    setQuoteShot(designs !== 1 ? null : pending ? cartShot.current : (recorderRef.current?.still() ?? null));
    setView("quote");
  };

  /** Varukorgens designer som egna rader: antal och summa för var och en, med orderns pris per skylt. */
  const cartSums = useMemo(
    () => designSums(cart.map((group) => groupBadges(group)), shop?.priceList, priceList),
    [cart, shop?.priceList, priceList],
  );
  /** Trappsteget för hela ordern: ett tillval kan kosta olika på olika trappsteg. */
  const tierIndex = tierIndexFor(
    orderBadges.reduce((total, badge) => total + Math.max(1, Math.floor(badge.quantity)), 0),
    priceList,
  );


  const recordVideo = async () => {
    if (recording) return;
    setStageNote(null);
    setRecording(true);
    // Filmen spelas in ur 3D-vyn. Knappen finns i alla vyer (besked via ägaren 2026-11-20), så från
    // Ritning eller På person visas 3D-vyn först, och filmen börjar när den har ritats.
    const switched = view !== "3d";
    if (switched) setView("3d");
    for (let waited = 0; !recorderRef.current && waited < RECORDER_WAIT_MS; waited += 100) await pause(100);
    if (switched && recorderRef.current) await pause(VIEW_SETTLE_MS);
    // Inspelaren läses efter väntan: den som fanns när knappen trycktes hör till en vy som är borta.
    const recorder = recorderRef.current;
    const clip = recorder ? await recorder.recordTurn(VIDEO_SECONDS).catch(() => null) : null;
    setVideoFailed(!clip);
    setRecording(false);
    if (!clip) {
      setStageNote("Webbläsaren kan inte spela in video — prova Chrome eller Safari.");
      return;
    }
    const url = URL.createObjectURL(clip.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = videoFileName(doc, clip.extension);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStageNote("3D-filmen är nedladdad.");
  };

  const endEngrave = useCallback(() => setEngrave(null), []);
  const finishOnboarding = useCallback(() => {
    setOnboarding(false);
    setEngrave(performance.now());
    // Kom besökaren hit utan namn skrivs det nu: markören ställs i skyltens första rad. Material och
    // form är valda i startrutan, så panelen fortsätter på texten.
    if (!hasText) requestAnimationFrame(() => focusFirstRow({ reveal: true }));
  }, [hasText]);

  // En återförsäljare kommer rakt in i editorn, utan startruta, och skriver namnet direkt. Panelen
  // står kvar på material, och textens sektion rullas fram när något skrivs.
  // Med en öppnad order börjar hen i varukorgen, inte med att skriva ett namn.
  const resellerStart = Boolean(reseller) && !copy && saved.ready && !onboarding;
  useEffect(() => {
    // Bara när raden är tom: en skylt som lästes tillbaka ur det sparade har redan sitt namn.
    if (resellerStart) focusFirstRow({ onlyEmpty: true });
  }, [resellerStart]);

  const { restart: resumeSaving } = saved;
  // Ytan eller färgen skylten hade senast på varje material. Byter kunden från mässing till plast och tillbaka
  // ska skylten vara mässing igen, inte materialets första yta.
  const lastColors = useRef<Partial<Record<string, string>>>({});
  useEffect(() => {
    lastColors.current[doc.materialId] = doc.colorId;
  }, [doc.materialId, doc.colorId]);
  const update = useCallback((action: DesignerAction) => {
    dispatch(action.type === "material" ? { ...action, colorId: lastColors.current[action.materialId] } : action);
    // Kommer i bakgrunden när loggans originalfil har sparats eller gravyrformen har räknats: kunden har inte ändrat något.
    if (action.type === "logo/original" || action.type === "logo/engraving") return;
    // Efter en lagd order sparas inget förrän kunden börjar på något nytt. Det gör hen nu.
    resumeSaving();
    // Den beställda skylten ger plats för den nya så fort något ändras.
    setOrderedDoc(null);
    if (isChoice(action)) track("choice");
    // En ny skylt räknas in i ordern så fort den ändras.
    setPending(false);
    if (action.type === "quantity") return;
    // Fästet sitter på baksidan: skylten vänds när fästet eller klämmans riktning väljs.
    const side = action.type === "mounting" || action.type === "clip/orientation" ? "back" : "front";
    setFocus({ side, key: performance.now() });
  }, [track, resumeSaving]);

  /** Kollegans skylt in i editorn; den som redigerades tar hennes plats i listan. */
  const openColleague = (index: number) => {
    const texts = batchEntries[index];
    if (!texts) return;
    setBatchText((text) => replaceBatchEntry(text, index, batchLine(doc)));
    update({ type: "texts", texts });
  };

  /** Skylten i editorn tas bort — nästa namn i listan tar över. */
  const removeCurrent = () => {
    const next = batchEntries[0];
    if (!next) return;
    setBatchText((text) => removeBatchEntry(text, 0));
    update({ type: "texts", texts: next });
  };
  /** Namnlistan under "Fler namn" ändras, för hand eller av en fil. */
  const changeNames = (text: string) => {
    // När listan får sina första namn gäller antalet varje namn, och börjar därför om på 1.
    const quantity = quantityForNames(doc.quantity, batchText, text);
    if (quantity !== doc.quantity) dispatch({ type: "quantity", quantity });
    setBatchText(text);
    setPending(false);
  };

  /**
   * Namn ur en uppladdad fil läggs sist i listan. Är skylten i editorn tom tar filens första namn
   * dess plats: annars följde en skylt utan text med i ordern, så att tio namn blev elva skyltar.
   */
  const importNames = (lines: string) => {
    const [first] = parseBatchInput(lines, 1);
    const fills = !hasText && first !== undefined;
    const added = fills ? removeBatchEntry(lines, 0) : lines;
    if (fills) update({ type: "texts", texts: first });
    const before = batchText.trimEnd();
    changeNames(before.trim() && added ? `${before}\n${added}` : before.trim() ? batchText : added);
  };

  /**
   * Kunden lämnar namnlistan. Saknar skylten i editorn text tar listans första namn dess plats
   * (`withLeadName`), så att namn som skrivs eller klistras in under en tom skylt inte ger en
   * skylt utan text först i ordern. Det görs inte medan kunden skriver: då hoppade första
   * tecknet upp i editorn.
   */
  const settleNames = () => {
    const lead = withLeadName({ doc, batchText });
    if (lead.batchText === batchText) return;
    update({ type: "texts", texts: lead.doc.rows.map((row) => row.text) });
    setBatchText(lead.batchText);
  };

  /** Lägger skylten i editorn i ordern och börjar på nästa: samma design, utan text. */
  const addDesign = () => {
    // Stillbilden tas medan skylten ännu syns i editorn. Den gäller bara så länge varukorgen har just den designen.
    cartShot.current = cart.length === 0 ? (recorderRef.current?.still() ?? null) : null;
    // En skylt utan text med namn i listan: listans första namn är den första skylten.
    const group = withLeadName({ doc, batchText });
    setCart((groups) => [...groups, group]);
    setBatchText("");
    dispatch({ type: "load", doc: { ...withTexts(doc, [""]), quantity: 1 } });
    setPending(true);
    setFocus({ side: "front", key: performance.now() });
    track("cart");
    // En ny varukorg efter en lagd order: kvittot ger plats för en ny kassa, och arbetet sparas igen.
    if (ordered) {
      setOrdered(false);
      setCheckoutRound((round) => round + 1);
    }
    resumeSaving();
    // Varukorgen visar vad som ligger där och hur ordern eller offerten skickas.
    setCartOpen(true);
  };

  /** Öppnar en design ur ordern i editorn. Den som redigerades tar dess plats, om den inte var ny och orörd. */
  const editDesign = (index: number) => {
    const target = cart[index];
    if (!target) return;
    cartShot.current = null;
    // Skylten i editorn tar designens plats i varukorgen bara när den har ett namn: en tom skylt
    // som bara har fått en annan färg ska inte hamna i ordern utan att någon lagt den där.
    const stash = !pending && (hasText || batchText.trim() !== "");
    setCart((groups) => (stash ? groups.map((group, i) => (i === index ? { doc, batchText } : group)) : groups.filter((_, i) => i !== index)));
    dispatch({ type: "load", doc: target.doc });
    setBatchText(target.batchText);
    setPending(false);
    setFocus({ side: "front", key: performance.now() });
  };

  const removeDesign = (index: number) => {
    // Utan något annat i ordern är skylten i editorn hela ordern, även om den är ny.
    if (cart.length === 1) setPending(false);
    cartShot.current = null;
    setCart((groups) => groups.filter((_, i) => i !== index));
  };

  /** Kastar skylten i editorn och börjar om på en ny med samma design. Varukorgen rörs inte. */
  const discardDesign = () => {
    if (cart.length === 0) return;
    setBatchText("");
    dispatch({ type: "load", doc: { ...withTexts(doc, [""]), quantity: 1 } });
    setPending(true);
    setFocus({ side: "front", key: performance.now() });
  };

  /** Kastar det som lästes tillbaka: skyltmotorn som den öppnades, med tom varukorg. */
  const startOver = () => {
    saved.dismiss();
    setOrderedDoc(null);
    setCart([]);
    setBatchText("");
    setPending(false);
    dispatch({ type: "load", doc: opening.doc });
    setFocus({ side: "front", key: performance.now() });
    if (closedByRestore.current.onboarding) setOnboarding(true);
    closedByRestore.current = { onboarding: false };
  };

  const cartQuantity = cartBadges.reduce((total, badge) => total + Math.max(1, Math.floor(badge.quantity)), 0);
  const designerCart = {
    designs: cart.length,
    pending,
    // Skylten i editorn är redan inräknad: den flyttas bara in i varukorgen.
    canAdd: orderBadges.length <= MAX_ORDER_BADGES,
    onAdd: addDesign,
    onDiscard: discardDesign,
    onOpen: () => setCartOpen(true),
    // Varukorgens knapp Offert: offerten visas på skyltens plats, med kunden som valdes i varukorgen.
    onQuote: reseller?.quoteSeller
      ? (target?: CustomerTarget) => {
          // Från varukorgen följer kunden som valdes där med. Från knappen vid priset väljs kunden i offerten.
          if (target && !reseller.customerId) quote.setTarget(target);
          setCartOpen(false);
          openQuote();
        }
      : undefined,
  };

  const layout = useMemo(() => layoutBadge(doc, fonts), [doc, fonts]);
  const moved = Boolean(doc.textOffsetMm || doc.logo?.offsetMm);
  /** Ritningen visar platshållare på en helt tom skylt. Då finns ingen logga, så här gäller skylten som den är. */
  const logoOverlapsText = Boolean(doc.logo) && layout.logoOverlapsText;
  /**
   * Något på skylten graveras. Bara då finns en gravyr att visa fram med lasern när skyltmotorn
   * öppnas: en metallskylt printas (beslut av ägaren 2026-11-18), så där visas ingen animation.
   * Knappen Gravera, som spelade animationen igen, togs bort på ägarens begäran 2026-11-19.
   */
  const engraves = (!layout.namePrinted && (layout.rows.length > 0 || layout.frames.length > 0)) || Boolean(layout.logo && !layout.logo.printed);


  return (
    <div className={styles.shell} data-view={view}>
      <section className={`${styles.stage} dot-grid`} aria-label="Förhandsvisning">
        <div className={styles.stageTop}>
          <div className={styles.viewToggle}>
            <Segmented label="Vy" value={view} options={VIEW_OPTIONS} onChange={setView} />
          </div>
          {/* Video och Offert finns i alla vyer av skylten, inte bara i 3D (besked via ägaren 2026-11-20). */}
          {view !== "quote" && (
            <div className={styles.stageActions}>
              {view === "drawing" && moved && (
                <button type="button" className={`chip ${styles.stageChip}`} onClick={() => update({ type: "move/reset" })}>
                  Återställ placering
                </button>
              )}
              <button
                type="button"
                className={`chip ${styles.stageChip}`}
                data-recording={recording}
                title={`Spela in en ${VIDEO_SECONDS} sekunders 3D-film och ladda ner den`}
                disabled={recording}
                onClick={() => void recordVideo()}
              >
                <svg className={styles.chipIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="6" width="13" height="12" rx="2.5" />
                  <path d="M16 10.5l5-3v9l-5-3z" />
                </svg>
                {recording ? "Spelar in…" : "Video"}
              </button>
              {/* Offerten visas på skyltens plats och laddas ner som PDF: säljarens åt en kund, eller kundens egen. */}
              {(reseller?.quoteSeller || selfQuote) && (
                <button
                  type="button"
                  className={`chip ${styles.stageChip}`}
                  title={selfQuote ? "Se offerten med era priser och ladda ner den som PDF" : "Se offerten som den ser ut, välj kund och spara den som PDF"}
                  disabled={recording}
                  onClick={openQuote}
                >
                  <svg className={styles.chipIcon} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 3h7l5 5v13H7z" />
                    <path d="M14 3v5h5M10 13h6M10 17h6" />
                  </svg>
                  Offert
                </button>
              )}
            </div>
          )}
          {view === "quote" && (
            <div className={styles.stageActions}>
              <button type="button" className={`chip ${styles.stageChip}`} onClick={() => setView("3d")}>
                ← Tillbaka till skylten
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className={styles.canvas}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "3d" ? (
              <Badge3D
                doc={stageDoc}
                fonts={fonts}
                spinning={false}
                focus={focus}
                engrave={engraves ? engrave : null}
                onEngraveDone={endEngrave}
                // Fotoläget, som strålspårade skylten, togs bort med sin knapp 2026-11-19.
                photo={false}
                photoSamples={0}
                onPhotoProgress={noPhotoProgress}
                recorderRef={recorderRef}
                adaptive
              />
            ) : view === "drawing" ? (
              <div className={styles.drawing}>
                <BadgeEditor doc={doc} fonts={fonts} dispatch={update} />
              </div>
            ) : view === "quote" ? (
              quote.markup ? (
                selfQuote ? (
                  // Kundens egen offert är säljarens dokument: kunden ser det, men ändrar inget i det.
                  <QuoteSheet markup={quote.markup} onEdit={quote.edit} onJump={quote.jump} locked />
                ) : (
                  // Ikonraden står till vänster om offerten och lägger till eller tar bort dess delar.
                  <div className={styles.quoteView}>
                    <QuoteRail elements={quote.elements} onToggle={quote.toggle} disabled={quote.save.status === "saving" || quote.save.status === "saved"} />
                    <QuoteSheet markup={quote.markup} onEdit={quote.edit} onJump={quote.jump} locked={quote.save.status === "saved"} />
                  </div>
                )
              ) : (
                <p className={styles.quoteEmpty}>
                  {quote.loading ? "Hämtar offerten…" : "Skriv ett namn eller lägg in en logga på skylten, så visas offerten här."}
                </p>
              )
            ) : (
              <VisualizeView state={visualize} />
            )}
          </motion.div>
        </AnimatePresence>

        <footer className={styles.stageBottom}>
          <p className={`mono ${styles.spec}`}>
            {stageDoc.size.widthMm} × {stageDoc.size.heightMm} mm · {getMaterial(stageDoc.materialId).name} ·{" "}
            {getColor(stageDoc.materialId, stageDoc.colorId).name}
          </p>
          {view === "3d" && recording ? (
            <p className={styles.hint} data-tip>Rör inte skylten medan filmen spelas in</p>
          ) : view === "3d" && stageNote ? (
            <p className={styles.hint} role="status">
              {stageNote}
            </p>
          ) : view === "3d" && !shownFromCart && orderedDoc ? (
            // Ordern är lagd: bilden är den beställda skylten, och fälten i panelen gäller nästa.
            <p className={styles.hint} role="status">
              Det här är skylten du beställde. Skriv ett namn för att börja på en ny.
            </p>
          ) : view === "3d" && shownFromCart ? (
            // Skylten på bilden ligger redan i varukorgen: fälten i panelen gäller nästa skylt.
            <p className={styles.hint} data-tip role="status">
              Skylten ligger i varukorgen. Skriv ett namn för att börja på nästa.
            </p>
          ) : view === "drawing" ? (
            // Varningen visas överallt. Tipset om hur man drar visas inte på telefon, där det tar skyltens plats.
            <p className={styles.hint} data-severity={logoOverlapsText ? "warning" : undefined} data-tip={logoOverlapsText ? undefined : ""} role="status">
              {logoOverlapsText
                ? "Loggan ligger över texten — dra isär dem så att båda syns på skylten."
                : `Dra texten eller loggan, eller dra i ett hörn för att ändra storlek. Streckad linje = säkerhetsmarginal, ${layout.contentInsetMm.toLocaleString("sv-SE")} mm.`}
            </p>
          ) : view === "3d" && logoOverlapsText ? (
            <p className={styles.hint} data-severity="warning" role="status">
              Loggan ligger över texten — flytta isär dem under Ritning.
            </p>
          ) : (
            view === "3d" && (
              <p className={styles.hint} data-tip>
                Dra för att vrida skylten ·{" "}
                <button type="button" className={styles.hintLink} onClick={() => setView("drawing")}>
                  Flytta text och logga
                </button>
              </p>
            )
          )}
        </footer>
        {view === "3d" && (
          <>
            <ProgressBanner
              variant="floating"
              active={recording}
              failed={videoFailed}
              title="3D-film"
              timed
              expectedMs={VIDEO_SECONDS * 1000}
              steps={VIDEO_STEPS}
              doneLabel="Filmen är nedladdad"
            />
          </>
        )}
      </section>

      <aside className={styles.panel} aria-label="Skyltmotor">
        <div className={styles.panelScroll}>
          {reseller && (
            <div className={styles.resellerBar} role="status">
              {reseller.customerId ? (
                <>
                  <span>
                    {reseller.mode === "quote" ? "Offert till" : "Order åt"} <strong>{reseller.customerName}</strong>
                    {reseller.project && <> · {reseller.project}</>}
                  </span>
                  <a href={reseller.mode === "quote" ? "/skapa?offert=1" : "/admin/ny-order"} className={styles.resellerLink}>
                    Byt kund
                  </a>
                </>
              ) : (
                <>
                  {/* Från panelens Ny offert: vägen är skylten, knappen Offert och kunden där. Annars väljs kunden i varukorgen. */}
                  <span>
                    {reseller.mode === "quote" && reseller.quoteSeller
                      ? "Ny offert. Gör skylten och tryck på Skapa offert. Kunden väljer du där."
                      : "Order eller offert åt en kund. Kunden väljer du i varukorgen."}
                  </span>
                  <a href="/admin" className={styles.resellerLink}>
                    Till panelen
                  </a>
                </>
              )}
            </div>
          )}
          {copy && (reseller || repeatOf) && (
            // Kunden ska se att det är en ny order: den gamla står kvar som den lades.
            <p className={styles.restored} role="status" data-copy-of={copy.orderNo}>
              <span>
                Kopia av {copy.label ?? copy.orderNo}. Du skapar en ny {reseller ? "order eller offert" : "order"}, och den gamla ändras inte.
              </span>
            </p>
          )}
          {saved.notice && (
            <p className={styles.restored} role="status">
              <span>{saved.notice === "cart" ? "Vi hämtade tillbaka din varukorg." : "Vi hämtade tillbaka din skylt."}</span>
              <button type="button" className={styles.hintLink} onClick={startOver}>
                Börja om
              </button>
              <button type="button" className={styles.restoredClose} aria-label="Stäng meddelandet" onClick={saved.dismiss}>
                ×
              </button>
            </p>
          )}
          <div className={styles.panelHead}>
            <p className="eyebrow">Skyltmotor</p>
            <h1 className={styles.panelTitle}>
              {reseller ? (reseller.customerId ? `Skylt till ${reseller.customerName}` : "Skylt till en kund") : "Din namnskylt"}
            </h1>
          </div>
          <SectionNav />
          {/*
            Skylten byggs uppifrån (besked från Mats på verkstaden via ägaren 2026-11-20): material och form
            sätter förutsättningarna, sedan text, metod, logga och fäste. Ordningen är `PANEL_SECTIONS`.
          */}
          <MaterialSection doc={doc} dispatch={update} />
          <FormatSection doc={doc} dispatch={update} />
          <TextSection
            doc={doc}
            layout={layout}
            dispatch={update}
            onPlace={() => setView("drawing")}
            placing={view === "drawing"}
          />
          {/* Metoden väljs före loggan (besked via ägaren 2026-11-16): den avgör hur loggan sedan märks. */}
          <MarkingSection doc={doc} dispatch={update} tierIndex={tierIndex} />
          <LogoSection doc={doc} dispatch={update} />
          <MountingSection doc={doc} dispatch={update} />
          <BatchSection
            current={doc}
            badges={batch}
            text={batchText}
            onTextChange={changeNames}
            onImport={importNames}
            onSettle={settleNames}
            onSelect={openColleague}
            onRemoveCurrent={removeCurrent}
            overflow={batchEntries.length - batch.length}
            fonts={fonts}
          />
        </div>
        {/* Vid priset läggs skylten i varukorgen. Order och offert skickas från varukorgen, inte härifrån. */}
        {/* Offertens uppgifter tar panelens plats medan offerten visas. Skyltens val står kvar under, dolda. */}
        {view === "quote" && reseller?.quoteSeller && <QuotePanel reseller={reseller} quote={quote} onBack={() => setView("3d")} />}
        {view === "quote" && selfQuote && <CustomerQuotePanel quote={quote} onBack={() => setView("3d")} />}
        <OrderSection
          mode="price"
          doc={doc}
          badges={orderBadges}
          dispatch={update}
          reseller={reseller}
          shop={shop}
          designs={cart.length + (pending ? 0 : 1)}
          // Skylten i editorn och dess namn: de visas för sig vid priset, skilda från varukorgen.
          own={pending ? 0 : 1 + batch.length}
          cart={designerCart}
        />
      </aside>
      {/*
        Offertens bilder tas ur en osynlig 3D-vy, en design i taget, medan offerten visas. Vyn ligger utanför
        panelen: panelens innehåll är dolt i offertvyn, och en dold ruta har ingen yta att rita på.
      */}
      {view === "quote" && quote.jobs.length > 0 && <QuoteShots jobs={quote.jobs} fonts={fonts} onShot={quote.onShot} onFilm={quote.onFilm} />}
      {/* Symbolen sitter i sidhuvudet, längst upp till höger. Sidor utan sidhuvud får den fast över sidan. */}
      {cartSlot &&
        (cartSlot.element ? (
          createPortal(<CartButton count={cartQuantity} onOpen={() => setCartOpen(true)} />, cartSlot.element)
        ) : (
          <CartButton count={cartQuantity} onOpen={() => setCartOpen(true)} floating />
        ))}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        summary={
          cart.length === 0
            ? ordered
              ? "Ordern är skickad"
              : "Tom"
            : `${cart.length === 1 ? "1 design" : `${cart.length} designer`} · ${cartQuantity} st`
        }
      >
        {/* Längst upp: en kund som har beställt förut loggar in och får kassan ifylld. */}
        {accounts && !reseller && (
          <CartAccount
            shop={shop?.slug ?? null}
            account={account}
            onChange={(next) => {
              setAccount(next);
              // Den som loggar ut tar sina uppgifter med sig: kassan börjar om tom, så att nästa
              // person vid samma dator inte möts av dem. Ett kvitto som står kvar rörs inte.
              if (!next && !ordered) setCheckoutRound((round) => round + 1);
            }}
          />
        )}
        {cart.length === 0 && !ordered && (
          <p className={cartStyles.empty}>
            Varukorgen är tom. Designa skylten och lägg den i varukorgen med knappen vid priset. Flera olika skyltar går i
            samma {reseller ? "order eller offert" : "order"}, med gemensam frakt.
          </p>
        )}
        {cart.length > 0 && (
          <CartList
            groups={cart}
            sums={cartSums}
            onEdit={(index) => {
              editDesign(index);
              setCartOpen(false);
            }}
            onRemove={removeDesign}
          />
        )}
        {cart.length > 0 && !pending && hasText && (
          <p className={cartStyles.note} role="status">
            Skylten i editorn ligger inte i varukorgen än. Stäng varukorgen och lägg den dit med knappen vid priset, om den
            ska med.
          </p>
        )}
        <OrderSection
          key={checkoutRound}
          mode="checkout"
          active={cartOpen}
          doc={doc}
          badges={cartBadges}
          dispatch={update}
          reseller={reseller}
          shop={shop}
          cardPayments={cardPayments}
          designs={cart.length}
          // Stillbilden visar en enda design och togs när den lades i varukorgen.
          // En order med flera designer visas med sina ritningar i stället.
          captureShot={() => (cart.length === 1 ? cartShot.current : null)}
          cart={designerCart}
          visitId={visitId}
          accounts={accounts}
          account={account}
          onAccount={setAccount}
          repeatOf={repeatOf}
          onStep={(step) => {
            track(step);
            if (step !== "ordered") return;
            setRepeatOf(null);
            forgetReorderInAddress();
            // Ordern är lagd: varukorgen ska inte komma tillbaka nästa gång.
            saved.finish();
            // Återförsäljaren skickas vidare till panelen. Kundens kvitto står kvar i en tom varukorg,
            // och skylten som beställdes står kvar i 3D.
            if (!reseller) {
              setOrderedDoc(cart[cart.length - 1]?.doc ?? null);
              cartShot.current = null;
              setCart([]);
              setPending(false);
              setOrdered(true);
            }
          }}
        />
        <div className={cartStyles.actions}>
          <button type="button" className="btn" onClick={() => setCartOpen(false)}>
            {cart.length === 0 ? "Stäng" : "Fortsätt designa"}
          </button>
        </div>
      </CartDrawer>
      {/* Visas först när det sparade är läst, så att rutan inte blinkar förbi för den som kommer tillbaka. */}
      {onboarding && saved.ready && <OnboardingDialog doc={doc} fonts={fonts} dispatch={update} onClose={finishOnboarding} />}
    </div>
  );
}
