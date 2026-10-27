import { notFound } from "next/navigation";
import { SmartInput } from "@/features/home/smart-input";
import { shopPath } from "@/features/shop/shop-frame";
import styles from "@/features/shop/shop.module.css";
import { getShop } from "@/lib/shops/repository";

const STEPS = [
  { title: "Skriv namnet", text: "Börja med namn och titel. Hela teamet går att lägga till på en gång — en rad per person." },
  { title: "Se skylten i 3D", text: "Välj material, färg, form och fäste. Lägg till er logga så graveras den med texten." },
  { title: "Beställ", text: "Skyltarna graveras och skickas inom fem arbetsdagar. Korrektur innan gravyr ingår." },
];

export default async function ShopHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.glow} aria-hidden="true" />
        <p className={styles.eyebrow}>Graverade namnskyltar från {shop.profile.name}</p>
        <h1 className={styles.title}>
          Skriv ditt namn.
          <span className={styles.titleMuted}>Vi graverar resten.</span>
        </h1>
        <p className={styles.lead}>Designa skylten själv och se den i 3D direkt — i mässing, aluminium, akryl eller gravyrplast.</p>
        <div className={styles.inputWrap}>
          <SmartInput target={shopPath(shop, "/skapa")} />
        </div>
      </section>
      <section id="sa-funkar-det" className={styles.usps} aria-label="Så funkar det">
        {STEPS.map((step, i) => (
          <article key={step.title} className={styles.usp}>
            <span className={styles.uspNo}>{i + 1}</span>
            <h2 className={styles.uspTitle}>{step.title}</h2>
            <p className={styles.uspText}>{step.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
