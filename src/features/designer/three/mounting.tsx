import { useMemo } from "react";
import { Path, Shape } from "three";
import { fitHardware, type BadgeDocument, type HardwareFootprint, type MountingId } from "@/engine";
import { UNITS_PER_MM } from "./geometry";

const HARDWARE_STEEL = "#c9ced4";
/** Fästplattan under nålen, en nyans mörkare så att nålen syns mot den. */
const HARDWARE_STEEL_DARK = "#9aa1a9";
/** Magnetens kropp: mörkt stål, så att den syns både mot en svart plastbaksida och mot ljus metall. */
const MAGNET_BODY = "#6b7178";
/** Hur högt över skyltens mitt fästet sitter, som andel av höjden. */
const HARDWARE_RISE: Record<MountingId, number> = { pin: 0.1, magnet: 0, clip: 0, "safety-pin": 0.12 };

const mm = UNITS_PER_MM;

/**
 * Fästenas mått i mm. Formerna är desamma som ikonerna i panelen: nålen med
 * sin ögla, hästskomagneten med sina poler och klämman med sin flik. Samma tal
 * styr både geometrin och ytan fästet tar på baksidan (`footprint`).
 */
function pinSize(widthMm: number) {
  const shaftMm = Math.min(widthMm * 0.5, 44);
  return { shaftMm, tipMm: 5, ringMm: 2.6, wireMm: 0.55, baseMm: shaftMm * 0.6 };
}

function magnetSize(heightMm: number) {
  const tallMm = Math.min(heightMm * 0.64, 18);
  const wideMm = tallMm * 0.94;
  return { tallMm, wideMm, legMm: wideMm * 0.31, depthMm: 2.4 };
}

function clipSize(heightMm: number) {
  const plateMm = Math.min(heightMm * 0.8, 22);
  return { plateMm, plateWideMm: 11, flapMm: plateMm * 0.62, flapWideMm: 12, rollMm: 1.3 };
}

/** Ytan fästet täcker på baksidan, i mm — samma mått som geometrin nedan. */
function footprint(mounting: MountingId, widthMm: number, heightMm: number): HardwareFootprint {
  const centerYMm = heightMm * (0.5 - HARDWARE_RISE[mounting]);
  switch (mounting) {
    case "pin": {
      const pin = pinSize(widthMm);
      return { widthMm: pin.shaftMm + pin.tipMm + pin.ringMm * 2, heightMm: pin.ringMm * 2 + pin.wireMm * 2, centerYMm };
    }
    case "magnet": {
      const magnet = magnetSize(heightMm);
      return { widthMm: magnet.wideMm, heightMm: magnet.tallMm, centerYMm };
    }
    case "clip": {
      const clip = clipSize(heightMm);
      return { widthMm: clip.flapWideMm, heightMm: clip.plateMm, centerYMm };
    }
    case "safety-pin":
      return { widthMm: widthMm * 0.56 + 4, heightMm: 3, centerYMm };
  }
}

interface MountingProps {
  doc: BadgeDocument;
  widthUnits: number;
  heightUnits: number;
  backZ: number;
}

/**
 * Fästet på baksidan. På en egen form flyttas det i höjdled och förminskas vid
 * behov, så att det inte sticker ut bakom en udd eller ett smalt parti.
 */
export function Mounting({ doc, widthUnits, heightUnits, backZ }: MountingProps) {
  const { mounting } = doc;
  const fit = useMemo(() => fitHardware(doc, footprint(doc.mounting, doc.size.widthMm, doc.size.heightMm)), [doc]);
  const lift = (doc.size.heightMm / 2 - fit.centerYMm) * UNITS_PER_MM - HARDWARE_RISE[mounting] * heightUnits * fit.scale;
  return (
    <group position={[0, lift, 0]} scale={[fit.scale, fit.scale, 1]}>
      <group position={[0, heightUnits * HARDWARE_RISE[mounting], backZ]}>
        {mounting === "pin" && <Pin widthMm={doc.size.widthMm} />}
        {mounting === "magnet" && <Magnet heightMm={doc.size.heightMm} />}
        {mounting === "clip" && <Clip heightMm={doc.size.heightMm} />}
        {mounting === "safety-pin" && <SafetyPin widthUnits={widthUnits} />}
      </group>
    </group>
  );
}

function Steel({ dark = false }: { dark?: boolean }) {
  return <meshStandardMaterial color={dark ? HARDWARE_STEEL_DARK : HARDWARE_STEEL} metalness={1} roughness={dark ? 0.42 : 0.26} />;
}

/** En rektangel med rundade hörn, med mitten i origo. Måtten är i scenens enheter. */
function roundedRect(target: Shape | Path, width: number, height: number, radius: number, centerX = 0, centerY = 0): void {
  const r = Math.min(radius, width / 2, height / 2);
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const bottom = centerY - height / 2;
  const top = centerY + height / 2;
  target.moveTo(left + r, bottom);
  target.lineTo(right - r, bottom);
  target.absarc(right - r, bottom + r, r, -Math.PI / 2, 0, false);
  target.lineTo(right, top - r);
  target.absarc(right - r, top - r, r, 0, Math.PI / 2, false);
  target.lineTo(left + r, top);
  target.absarc(left + r, top - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(left, bottom + r);
  target.absarc(left + r, bottom + r, r, Math.PI, Math.PI * 1.5, false);
}

/** Skivan en form pressas ur: tjockleken och en liten fas, så att kanten fångar ljuset. */
const plate = (depthMm: number, bevelMm = 0.12) => ({
  depth: depthMm * mm,
  bevelEnabled: true,
  bevelThickness: bevelMm * mm,
  bevelSize: bevelMm * mm,
  bevelSegments: 2,
  curveSegments: 24,
});

/**
 * Nålen: en smal fästplatta mot skylten, och på den en nål med spets och ögla.
 * Öglan sitter till vänster sett framifrån, alltså till höger när skylten vänds,
 * som i ikonen.
 */
function Pin({ widthMm }: { widthMm: number }) {
  const { shaftMm, tipMm, ringMm, wireMm, baseMm } = pinSize(widthMm);
  const base = useMemo(() => {
    const shape = new Shape();
    roundedRect(shape, baseMm * mm, 3.4 * mm, 1.7 * mm);
    return shape;
  }, [baseMm]);
  // Nålen ligger en bit från plattan, buren av två små stolpar.
  const needleZ = -1.7 * mm;
  // Öglan är lite bredare än spetsen är lång: skaftet skjuts så att hela nålen hamnar mitt på skylten.
  const shaftCenterX = ((ringMm * 2 - tipMm) / 2) * mm;
  return (
    <group>
      <mesh position={[0, 0, -0.75 * mm]}>
        <extrudeGeometry args={[base, plate(0.5)]} />
        <Steel dark />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * baseMm * 0.36 * mm, 0, -1.2 * mm]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.7 * mm, 0.7 * mm, 1 * mm, 16]} />
          <Steel dark />
        </mesh>
      ))}
      <group position={[shaftCenterX, 0, needleZ]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[wireMm * mm, wireMm * mm, shaftMm * mm, 16]} />
          <Steel />
        </mesh>
        {/* Spetsen pekar åt höger sett framifrån. */}
        <mesh position={[(shaftMm / 2 + tipMm / 2) * mm, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[wireMm * mm, tipMm * mm, 16]} />
          <Steel />
        </mesh>
        <mesh position={[-(shaftMm / 2 + ringMm - wireMm * 0.6) * mm, 0, 0]}>
          <torusGeometry args={[ringMm * mm, wireMm * mm, 14, 40]} />
          <Steel />
        </mesh>
      </group>
    </group>
  );
}

/** Magneten: en hästsko med polerna uppåt. Kroppen är mörk och polerna blanka. */
function Magnet({ heightMm }: { heightMm: number }) {
  const { tallMm, wideMm, legMm, depthMm } = magnetSize(heightMm);
  const { body, poles } = useMemo(() => {
    const outer = (wideMm / 2) * mm;
    const inner = outer - legMm * mm;
    const top = (tallMm / 2) * mm;
    // Bågens mitt: ytterbågen når precis ner till hästskons botten.
    const arcY = outer - top;
    const poleMm = (tallMm - wideMm / 2) * 0.42;
    const poleY = top - poleMm * mm;
    // En smal springa skiljer polerna från kroppen, som strecket i ikonen.
    const gap = 0.07 * mm;
    const bodyShape = new Shape();
    bodyShape.moveTo(-outer, poleY - gap);
    bodyShape.lineTo(-inner, poleY - gap);
    bodyShape.lineTo(-inner, arcY);
    bodyShape.absarc(0, arcY, inner, Math.PI, Math.PI * 2, false);
    bodyShape.lineTo(inner, poleY - gap);
    bodyShape.lineTo(outer, poleY - gap);
    bodyShape.lineTo(outer, arcY);
    bodyShape.absarc(0, arcY, outer, 0, -Math.PI, true);
    bodyShape.lineTo(-outer, poleY - gap);
    // Polerna är raka mot kroppen och rundade upptill.
    const round = legMm * 0.3 * mm;
    const poleShapes = [-1, 1].map((side) => {
      const left = side < 0 ? -outer : inner;
      const right = side < 0 ? -inner : outer;
      const pole = new Shape();
      pole.moveTo(left, poleY + gap);
      pole.lineTo(right, poleY + gap);
      pole.lineTo(right, top - round);
      pole.absarc(right - round, top - round, round, 0, Math.PI / 2, false);
      pole.lineTo(left + round, top);
      pole.absarc(left + round, top - round, round, Math.PI / 2, Math.PI, false);
      pole.lineTo(left, poleY + gap);
      return pole;
    });
    return { body: bodyShape, poles: poleShapes };
  }, [tallMm, wideMm, legMm]);
  const z = -(depthMm + 0.2) * mm;
  return (
    <group position={[0, 0, z]}>
      <mesh>
        <extrudeGeometry args={[body, plate(depthMm, 0.12)]} />
        <meshStandardMaterial color={MAGNET_BODY} metalness={0.9} roughness={0.46} />
      </mesh>
      {poles.map((pole, i) => (
        <mesh key={i}>
          <extrudeGeometry args={[pole, plate(depthMm, 0.12)]} />
          <Steel />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Klämman: en platta mot skylten, och över dess övre del en flik med en
 * avlång öppning. Fliken och plattan hålls ihop av en rulle upptill.
 */
function Clip({ heightMm }: { heightMm: number }) {
  const { plateMm, plateWideMm, flapMm, flapWideMm, rollMm } = clipSize(heightMm);
  const { back, flap } = useMemo(() => {
    const backShape = new Shape();
    roundedRect(backShape, plateWideMm * mm, plateMm * mm, 1.6 * mm);
    const flapShape = new Shape();
    // Fliken hänger från plattans överkant.
    const flapY = ((plateMm - flapMm) / 2) * mm;
    roundedRect(flapShape, flapWideMm * mm, flapMm * mm, 1.8 * mm, 0, flapY);
    const slot = new Path();
    roundedRect(slot, 1.9 * mm, flapMm * 0.42 * mm, 0.95 * mm, 0, flapY - flapMm * 0.04 * mm);
    flapShape.holes.push(slot);
    return { back: backShape, flap: flapShape };
  }, [plateMm, plateWideMm, flapMm, flapWideMm]);
  return (
    <group>
      <mesh position={[0, 0, -0.85 * mm]}>
        <extrudeGeometry args={[back, plate(0.6)]} />
        <Steel dark />
      </mesh>
      <mesh position={[0, 0, -3.1 * mm]}>
        <extrudeGeometry args={[flap, plate(0.6)]} />
        <Steel />
      </mesh>
      <mesh position={[0, (plateMm / 2 - rollMm * 0.4) * mm, -(rollMm + 0.75) * mm]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[rollMm * mm, rollMm * mm, flapWideMm * mm, 24]} />
        <Steel />
      </mesh>
    </group>
  );
}

/** Säkerhetsnålen säljs inte längre, men äldre ordrar ska gå att rita. */
function SafetyPin({ widthUnits: w }: { widthUnits: number }) {
  return (
    <group position={[0, 0, -1 * mm]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3 * mm, 0.3 * mm, w * 0.56, 10]} />
        <Steel />
      </mesh>
      <mesh position={[-w * 0.28, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.4 * mm, 0.3 * mm, 8, 24]} />
        <Steel />
      </mesh>
      <mesh position={[w * 0.28, 0, 0]}>
        <boxGeometry args={[4 * mm, 3 * mm, 1.6 * mm]} />
        <Steel />
      </mesh>
    </group>
  );
}
