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
}
