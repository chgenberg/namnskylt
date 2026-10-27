import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ProductionLogin } from "@/features/production/production-login";
import { ProductionPage } from "@/features/production/production-page";
import { productionPass } from "@/lib/production-auth/session";

export const metadata: Metadata = {
  title: "Verkstad",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/** Länkas inte från sajten. Utan `PRODUCTION_PASSWORD` finns sidan inte alls. */
export default async function VerkstadRoute() {
  if (!productionPass.configured()) notFound();
  const signedIn = await productionPass.verify((await cookies()).get(productionPass.cookie)?.value);
  return <main>{signedIn ? <ProductionPage /> : <ProductionLogin />}</main>;
}
