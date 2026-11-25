/**
 * Filmen för återförsäljare, som ligger under `public/film/`. `null` tills filmen är godkänd och
 * inlagd: då visar sidan med filmen bara numret till Pär och formuläret, och startsidan länkar inte dit.
 */
export interface DemoFilm {
  /** 16:9, för dator och surfplatta. */
  wide: { src: string; poster: string };
  /** 9:16, för telefon. */
  tall: { src: string; poster: string };
  /** Längden, som den står vid länken: "under en minut". */
  length: string;
}

export const DEMO_FILM: DemoFilm | null = {
  wide: { src: "/film/aterforsaljare-16x9.mp4", poster: "/film/aterforsaljare-16x9.jpg" },
  tall: { src: "/film/aterforsaljare-9x16.mp4", poster: "/film/aterforsaljare-9x16.jpg" },
  length: "under en minut",
};
