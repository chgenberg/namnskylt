const TIME_ZONE = "Europe/Stockholm";

export function formatSek(value: number): string {
  return `${new Intl.NumberFormat("sv-SE").format(value)} kr`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(
    new Date(iso),
  );
}

/** "i dag", "i går", "för 5 dagar sedan", annars datum. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "i dag";
  if (days === 1) return "i går";
  if (days < 14) return `för ${days} dagar sedan`;
  if (days < 60) return `för ${Math.round(days / 7)} veckor sedan`;
  return formatDay(iso);
}

function startOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
  return Date.parse(`${parts}T00:00:00Z`);
}
