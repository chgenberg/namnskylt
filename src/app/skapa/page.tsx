import type { Metadata } from "next";
import { Designer } from "@/features/designer/designer";

export const metadata: Metadata = {
  title: "Skapa namnskylt",
};

interface SkapaPageProps {
  searchParams: Promise<{ t?: string | string[] }>;
}

export default async function SkapaPage({ searchParams }: SkapaPageProps) {
  const { t } = await searchParams;
  const initialText = Array.isArray(t) ? (t[0] ?? "") : (t ?? "");
  return (
    <main>
      <Designer initialText={initialText} />
    </main>
  );
}
