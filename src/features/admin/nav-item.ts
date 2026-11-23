/** Ikonerna som panelens meny kan visa. */
export type AdminNavIcon =
  | "overview"
  | "orders"
  | "quotes"
  | "customers"
  | "stats"
  | "export"
  | "purchase"
  | "shops"
  | "outreach"
  | "split"
  | "workshop"
  | "resellers"
  | "ops"
  | "settings";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminNavIcon;
  /** Siffra bredvid namnet: något som väntar på beslut. Visas inte när den är 0. */
  badge?: number;
  /** Menyposten bär antalet olästa besked: panelens första sida, där listan "Nytt sedan sist" står. */
  news?: boolean;
  /** Antalet i listan bakom fliken, i återförsäljarens flikar: offerter, ordrar och kunder. */
  count?: number;
}
