export type HowItWorksFlow = "write" | "design" | "preview" | "team" | "deliver";

export interface HowItWorksStep {
  flow: HowItWorksFlow;
  /** Kort etikett i stegraden överst. */
  short: string;
  title: string;
  lead: string;
  body: readonly string[];
  options?: readonly { title: string; body: string }[];
  cta?: { label: string; href: string };
}

export const HOW_IT_WORKS = {
  eyebrow: "Så funkar det",
  title: "Från ett namn till en skylt på bröstet",
  body: "Ingen mall att ladda ner, ingen offert att vänta på. Du skriver, ser resultatet direkt och vi graverar — fem steg, oftast några minuter.",
  stripLabel: "Stegen i korthet",
  steps: [
    {
      flow: "write",
      short: "Skriv",
      title: "Skriv namnet",
      lead: "Börja som en sökning. Resten löser sig.",
      body: [
        "Skriv namn och titel i rutan på startsidan, separerat med komma. Skylten ritas medan du skriver — namnet blir stort och fetat, titeln mindre under.",
        "Långa namn krymps automatiskt så att de alltid får plats med rätt marginal till kanten.",
      ],
      cta: { label: "Prova rutan", href: "#borja" },
    },
    {
      flow: "design",
      short: "Formge",
      title: "Välj material och känsla",
      lead: "Samma motor som leverantören graverar efter.",
      body: [
        "Välj mellan gravyrplast i tio färger, borstad eloxerad aluminium och rostfritt stål. Vrid skylten i 3D, se gravyren i ljuset och kontrollera måtten i ritningsvyn.",
      ],
      options: [
        { title: "Form & storlek", body: "Rak, rundad eller oval — från kompakta 60 × 20 mm till stora 90 × 40 mm." },
        { title: "Fäste", body: "Nål, magnet utan hål i plagget, klämma eller säkerhetsnål." },
      ],
    },
    {
      flow: "preview",
      short: "Se den",
      title: "Se den på riktigt",
      lead: "På dig själv — eller på tre andra.",
      body: [
        "Under fliken På person skapar vi fotorealistiska bilder där skylten sitter på bröstet, med din text och ditt material.",
      ],
      options: [
        { title: "Ditt foto", body: "Ta en bild med kameran eller ladda upp en, halvkropp eller helkropp. Fotot sparas inte." },
        { title: "En person", body: "En svensk person vars kön och ålder passar namnet, i en miljö som passar titeln." },
      ],
    },
    {
      flow: "team",
      short: "Hela teamet",
      title: "Lägg till hela teamet",
      lead: "Ett namn per rad. Samma design på alla.",
      body: [
        "När den första skylten är klar skriver du resten av namnen under Fler namn — eller klistrar in två kolumner direkt från Excel. Varje rad blir en egen skylt med exakt samma design.",
        "Mängdrabatten räknas på hela ordern: 15 % från 10 skyltar, 28 % från 50 och 40 % från 200.",
      ],
      cta: { label: "Börja med första skylten", href: "#borja" },
    },
    {
      flow: "deliver",
      short: "Leverans",
      title: "Vi graverar och skickar",
      lead: "Tillverkat i Sverige inom fem arbetsdagar.",
      body: [
        "Ordern går direkt till Skylt & Gravyrteknik som en exakt produktionsfil — samma linjer du såg på skärmen. De graverar, kontrollerar och skickar hem till dig eller till kontoret.",
      ],
    },
  ],
} as const satisfies {
  eyebrow: string;
  title: string;
  body: string;
  stripLabel: string;
  steps: readonly HowItWorksStep[];
};
