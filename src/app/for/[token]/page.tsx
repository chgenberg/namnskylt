import type { Metadata } from "next";
import { OutreachLanding, OutreachLandingGone } from "@/features/outreach-landing/landing";
import { selectedTile } from "@/lib/outreach/landing";
import { loadLanding } from "@/lib/outreach/landing-data";

export const metadata: Metadata = {
  title: "Er namnskyltsbutik",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

interface LandingPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ f?: string | string[]; m?: string | string[]; c?: string | string[] }>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Landningen från återförsäljarmejlet: deras skylt, materialen och aktiveringen. */
export default async function LandingPage({ params, searchParams }: LandingPageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const data = await loadLanding(token);
  if (!data) return <OutreachLandingGone />;
  const selected = selectedTile(data.tiles, { f: first(query.f), m: first(query.m), c: first(query.c) });
  return (
    <OutreachLanding
      token={token}
      data={data}
      selected={selected}
      calendlyUrl={process.env.CALENDLY_URL?.startsWith("https://") ? process.env.CALENDLY_URL : null}
    />
  );
}
