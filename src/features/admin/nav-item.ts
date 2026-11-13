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
  | "settings";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminNavIcon;
}
