import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approxFonts,
  badgeDocumentSchema,
  createBadgeDocument,
  engravingPaths,
  layoutBadge,
  printedPaths,
  renderBadgeSvg,
  type FontEngine,
} from "./index";
import { logoEngravingPath, logoImageRef, placeLogoPath, type RgbaPixels } from "./logo";
import { colorLogo, visibleMask } from "./logo-color";
import { engravingMask, traceLogoEngraving } from "./logo-engrave";
import type { BadgeDocument, BadgeLogo } from "./types";

type Rgba = readonly [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 255];
const LIGHT_GREY: Rgba = [232, 232, 232, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const RED: Rgba = [220, 30, 40, 255];
const BLUE: Rgba = [20, 60, 160, 255];
const YELLOW: Rgba = [255, 221, 0, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

function image(width: number, height: number, at: (x: number, y: number) => Rgba): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(at(x, y), (y * width + x) * 4);
  return { data, width, height };
}

const inside = (x: number, y: number, left: number, top: number, right: number, bottom: number) =>
  x >= left && x <= right && y >= top && y <= bottom;

/** Bläcket i en mask som en ruta att slå upp i. */
function inkAt(result: ReturnType<typeof engravingMask>, width: number) {
  assert.equal(result.kind, "detail");
  const mask = result.kind === "detail" ? result.mask : new Uint8Array(0);
  return (x: number, y: number) => mask[y * width + x] === 1;
}

/** Blå platta med ett vitt fält inuti, på genomskinlig botten. */
const plate = (inner: Rgba) => image(60, 40, (x, y) => (inside(x, y, 20, 14, 39, 25) ? inner : inside(x, y, 4, 4, 55, 35) ? BLUE : CLEAR));

describe("gravyrformen av en logga i färg", () => {
  it("gör vitt inuti loggan till urtag, så att en platta med vit text inte blir en klump", () => {
    const ink = inkAt(engravingMask(plate(WHITE)), 60);
    assert.equal(ink(10, 10), true, "plattan graveras");
    assert.equal(ink(30, 20), false, "det vita sparas ur");
    assert.equal(ink(1, 1), false, "utanför loggan finns inget");
    // Mycket ljust grått är också papper.
    assert.equal(inkAt(engravingMask(plate(LIGHT_GREY)), 60)(30, 20), false);
  });

  it("räknar mörkt och mellangrått som bläck, vilken färg det än är", () => {
    // Två fält bredvid varandra, så att inget ligger inneslutet i det andra.
    const pair = (right: Rgba) => image(60, 30, (x, y) => (!inside(x, y, 4, 4, 55, 25) ? CLEAR : x < 30 ? BLUE : right));
    assert.deepEqual(engravingMask(pair([120, 120, 120, 255])), { kind: "silhouette" });
    assert.deepEqual(engravingMask(pair(BLACK)), { kind: "silhouette" });
    const ink = inkAt(engravingMask(pair(LIGHT_GREY)), 60);
    assert.equal(ink(10, 15), true);
    assert.equal(ink(45, 15), false);
  });

  it("graverar ljusa färger som gult, som skiljer sig från vitt i färg men inte i ljushet", () => {
    const logo = image(60, 40, (x, y) => (inside(x, y, 20, 14, 39, 25) ? WHITE : inside(x, y, 4, 4, 55, 35) ? YELLOW : CLEAR));
    const ink = inkAt(engravingMask(logo), 60);
    assert.equal(ink(10, 10), true);
    assert.equal(ink(30, 20), false);
  });

  it("gör en detalj i en annan färg till urtag när den ligger innesluten i en fylld form", () => {
    const ink = inkAt(engravingMask(plate(YELLOW)), 60);
    assert.equal(ink(10, 10), true, "plattan graveras");
    assert.equal(ink(30, 20), false, "den gula detaljen sparas ur, så att den syns");
  });

  it("graverar hela siluetten när loggan är fylld rakt igenom", () => {
    // Röd cirkel och blå fyrkant bredvid varandra: två färger, men ingen innesluten i den andra.
    const logo = image(80, 40, (x, y) => (Math.hypot(x - 20, y - 20) <= 14 ? RED : inside(x, y, 46, 6, 73, 33) ? BLUE : CLEAR));
    assert.deepEqual(engravingMask(logo), { kind: "silhouette" });
    assert.deepEqual(traceLogoEngraving(logo), { kind: "silhouette" });
  });

  it("graverar hela siluetten av en vit logga med en liten färgad detalj, hellre än bara detaljen", () => {
    const logo = image(80, 40, (x, y) => (inside(x, y, 70, 30, 73, 33) ? RED : inside(x, y, 6, 6, 75, 35) ? WHITE : CLEAR));
    assert.deepEqual(engravingMask(logo), { kind: "silhouette" });
    // Med mer färg än så delas loggan i bläck och papper som vanligt.
    const half = image(80, 40, (x, y) => (inside(x, y, 6, 6, 40, 35) ? RED : inside(x, y, 6, 6, 75, 35) ? WHITE : CLEAR));
    const ink = inkAt(engravingMask(half), 80);
    assert.equal(ink(20, 20), true);
    assert.equal(ink(60, 20), false);
  });

  it("graverar vitt som står för sig självt, som en vit ordbild med en färgad detalj bredvid", () => {
    // Två vita block och en röd prick, alla skilda åt av det genomskinliga. Pricken är stor nog att inte vara brus.
    const logo = image(90, 40, (x, y) =>
      inside(x, y, 4, 8, 30, 31) || inside(x, y, 36, 8, 60, 31) ? WHITE : inside(x, y, 68, 8, 84, 24) ? RED : CLEAR,
    );
    assert.deepEqual(engravingMask(logo), { kind: "silhouette" });
    // Samma vita block intill en färgad platta är däremot botten, och sparas ur.
    const plateLogo = image(90, 40, (x, y) => (inside(x, y, 36, 8, 60, 31) ? WHITE : inside(x, y, 4, 4, 84, 35) ? RED : CLEAR));
    assert.equal(inkAt(engravingMask(plateLogo), 90)(48, 20), false);
  });

  it("gör en vit platta bakom färgad text till botten, så att texten graveras och inte plattan", () => {
    const logo = image(90, 40, (x, y) => (inside(x, y, 20, 12, 69, 27) ? RED : inside(x, y, 4, 4, 85, 35) ? WHITE : CLEAR));
    const ink = inkAt(engravingMask(logo), 90);
    assert.equal(ink(40, 20), true, "texten graveras");
    assert.equal(ink(8, 8), false, "plattan sparas ur");
  });

  it("räknar inte en smal ljus rand runt loggan som urtag", () => {
    // En pixel bred ljus kant mellan loggan och det genomskinliga, som efter utjämning i en JPG.
    const logo = image(60, 30, (x, y) => (inside(x, y, 6, 6, 53, 23) ? BLUE : inside(x, y, 5, 5, 54, 24) ? LIGHT_GREY : CLEAR));
    assert.deepEqual(engravingMask(logo), { kind: "silhouette" });
  });

  it("tar inte kantens blandfärger för en platta runt loggan, som i en uppförstorad JPG", () => {
    // En röd platta med en två pixlar bred, mörkare kant runt om: kanten är ingen platta, och plattan ingen detalj.
    const DARK_RED: Rgba = [90, 10, 20, 255];
    const logo = image(80, 50, (x, y) => (inside(x, y, 8, 8, 71, 41) ? RED : inside(x, y, 6, 6, 73, 43) ? DARK_RED : CLEAR));
    assert.deepEqual(engravingMask(logo), { kind: "silhouette" });
    // En kontur som är bred nog att fräsa för sig är däremot en platta, och fyllningen i den sparas ur.
    const outlined = image(80, 50, (x, y) => (inside(x, y, 16, 16, 63, 33) ? YELLOW : inside(x, y, 6, 6, 73, 43) ? BLACK : CLEAR));
    const ink = inkAt(engravingMask(outlined), 80);
    assert.equal(ink(10, 25), true, "konturen graveras");
    assert.equal(ink(40, 25), false, "fyllningen sparas ur");
  });

  it("graverar siluetten när gravyrformen bara skiljer sig med brus längs kanten", () => {
    // Ett vitt hål på några pixlar i en stor platta är för litet att vara en detalj.
    const logo = image(120, 80, (x, y) => (inside(x, y, 58, 38, 61, 41) ? WHITE : inside(x, y, 4, 4, 115, 75) ? BLUE : CLEAR));
    assert.deepEqual(engravingMask(logo), { kind: "silhouette" });
  });

  it("avgör en utjämnad kant vid halv täckning", () => {
    const edge = (alpha: number) => image(40, 20, (x, y) => (x === 4 ? [20, 60, 160, alpha] : inside(x, y, 5, 4, 35, 15) ? BLUE : CLEAR));
    // Kanten räknas till loggan från halv täckning, och hela loggan är då bläck.
    assert.deepEqual(engravingMask(edge(200)), { kind: "silhouette" });
    assert.deepEqual(engravingMask(edge(60)), { kind: "silhouette" });
    const framed = (alpha: number) =>
      image(40, 20, (x, y) => (inside(x, y, 18, 8, 22, 12) ? [255, 255, 255, alpha] : inside(x, y, 5, 4, 35, 15) ? BLUE : CLEAR));
    // Ett genomskinligt hål i plattan syns inte, så siluetten har redan hålet.
    assert.deepEqual(engravingMask(framed(40)), { kind: "silhouette" });
    assert.equal(inkAt(engravingMask(framed(255)), 40)(20, 10), false);
  });

  it("vänder bläck och urtag inom siluetten när loggan inverteras", () => {
    const ink = inkAt(engravingMask(plate(WHITE), true), 60);
    assert.equal(ink(10, 10), false, "plattan sparas ur");
    assert.equal(ink(30, 20), true, "det vita graveras");
    assert.equal(ink(1, 1), false, "utanför loggan finns fortfarande inget");
    // En logga som är fylld rakt igenom blir tom när den vänds.
    const solid = image(40, 20, (x, y) => (inside(x, y, 5, 4, 35, 15) ? RED : CLEAR));
    assert.deepEqual(engravingMask(solid, true), { kind: "empty" });
    assert.deepEqual(traceLogoEngraving(solid, true), { kind: "empty" });
  });

  it("blir banor i bildens ruta, med urtaget som hål, och utan brusprickar", () => {
    // Två enstaka vita pixlar i plattan är brus och ska inte bli hål.
    const noisy = image(60, 40, (x, y) =>
      (x === 8 && y === 8) || (x === 50 && y === 30) ? WHITE : inside(x, y, 20, 14, 39, 25) ? WHITE : inside(x, y, 4, 4, 55, 35) ? BLUE : CLEAR,
    );
    const engraving = traceLogoEngraving(noisy);
    assert.equal(engraving.kind, "detail");
    const d = engraving.kind === "detail" ? engraving.d : "";
    assert.equal(d.split("M").length - 1, 2, "plattans ytterkant och ett hål");
    assert.match(d, /^(?:[MLZ]|-?\d+(?:\.\d+)?|\s)+$/);
    // Koordinaterna ligger i bildens ruta, inte beskurna till bläcket: plattan börjar vid x = 4.
    const xs = (d.match(/[ML](-?\d+(?:\.\d+)?)/g) ?? []).map((token) => Number(token.slice(1)));
    assert.ok(Math.min(...xs) >= 3 && Math.min(...xs) <= 5, `vänsterkanten ligger på ${Math.min(...xs)}`);
  });

  it("gäller bilden så som den görs i ordning för trycket: en vit botten är redan borta, även inuti loggan", () => {
    // Blå platta med vit text på vit botten, som en JPG utan genomskinlighet.
    const jpg = image(80, 50, (x, y) => (inside(x, y, 30, 20, 49, 29) ? WHITE : inside(x, y, 10, 10, 69, 39) ? BLUE : WHITE));
    const logo = colorLogo(jpg);
    assert.ok(logo);
    // Det vita inuti plattan togs bort med bottnen, så siluetten har redan urtaget och är gravyrformen.
    assert.deepEqual(traceLogoEngraving(logo), { kind: "silhouette" });
    const visible = visibleMask(logo);
    const at = (x: number, y: number) => visible[y * logo.width + x];
    assert.equal(at(Math.floor(logo.width / 2), Math.floor(logo.height / 2)), 0, "urtaget finns i siluetten");
    assert.equal(at(4, 4), 1);
  });
});

const fonts: FontEngine = { ...approxFonts, outline: () => "M0 0L1 0L1 1Z" };
const SILHOUETTE = "M0 0L20 0L20 10L0 10Z";
const FORM = "M0 0L20 0L20 10L0 10ZM5 3L15 3L15 7L5 7Z";
const logo: BadgeLogo = {
  d: SILHOUETTE,
  engraveD: FORM,
  viewWidth: 20,
  viewHeight: 10,
  placement: "left",
  heightMm: 10,
  image: { src: logoImageRef("ab".repeat(32)) },
};
/** Samma logga utan gravyrform, som en skylt sparad innan den fanns. */
const plain: BadgeLogo = { ...logo };
delete plain.engraveD;
const badge = (marking: BadgeDocument["marking"], withLogo: BadgeLogo = logo): BadgeDocument => ({
  ...createBadgeDocument(["Anna Lind"]),
  logo: withLogo,
  ...(marking && { marking }),
});

describe("skylten med en logga i färg som graveras", () => {
  it("fräser gravyrformen, inte siluetten", () => {
    const layout = layoutBadge(badge("engrave"), fonts);
    assert.ok(layout.logo);
    const scale = layout.logo.width / logo.viewWidth;
    assert.equal(layout.logo.d, placeLogoPath(FORM, scale, layout.logo.x, layout.logo.y));
    const engraved = engravingPaths(layout, fonts)?.find((path) => path.kind === "logo");
    assert.equal(engraved?.d, layout.logo.d);
    assert.equal(engraved?.fillRule, "evenodd");
    assert.equal(printedPaths(layout, fonts)?.some((path) => path.kind === "logo"), false);
    // Bilden ritas inte när loggan graveras.
    const svg = renderBadgeSvg(badge("engrave"), layout, { mode: "preview", fonts });
    assert.ok(!svg.includes("<image"));
    assert.ok(svg.includes(layout.logo.d));
  });

  it("trycker loggan som förut: bilden ritas, och siluetten är oförändrad", () => {
    for (const marking of ["print", "engrave-name-print-logo", undefined] as const) {
      const layout = layoutBadge(badge(marking), fonts);
      assert.ok(layout.logo);
      const scale = layout.logo.width / logo.viewWidth;
      assert.equal(layout.logo.d, placeLogoPath(SILHOUETTE, scale, layout.logo.x, layout.logo.y), String(marking));
      assert.equal(layout.logo.imageSrc, logo.image?.src);
      assert.equal(engravingPaths(layout, fonts)?.some((path) => path.kind === "logo"), false);
    }
    // Skylten är densamma när den trycks, med och utan gravyrform.
    assert.deepEqual(layoutBadge(badge("print"), fonts), layoutBadge(badge("print", plain), fonts));
  });

  it("graverar siluetten när loggan saknar gravyrform, som äldre skyltar", () => {
    const layout = layoutBadge(badge("engrave", plain), fonts);
    assert.ok(layout.logo);
    assert.equal(layout.logo.d, placeLogoPath(SILHOUETTE, layout.logo.width / logo.viewWidth, layout.logo.x, layout.logo.y));
    assert.equal(logoEngravingPath(plain), SILHOUETTE);
    assert.equal(logoEngravingPath(logo), FORM);
  });

  it("godtas av schemat, som bara släpper igenom banor i gravyrformen", () => {
    assert.equal(badgeDocumentSchema.safeParse(badge("engrave")).success, true);
    assert.equal(badgeDocumentSchema.safeParse(badge("engrave", { ...logo, engraveD: '"/><script>' })).success, false);
    assert.equal(badgeDocumentSchema.safeParse(badge("engrave", { ...logo, engraveD: "" })).success, false);
  });
});
