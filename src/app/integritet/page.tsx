import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { PrivacyPage } from "@/features/privacy/privacy-page";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const metadata: Metadata = {
  title: "Integritetspolicy",
  description: "Skylt & Gravyrteknik ansvarar för personuppgifterna när du beställer på namnskylt.com.",
};

export default async function IntegritetPage() {
  const agent = databaseConfigured() ? await getCompanyProfile(OWNER_TENANT) : DEFAULT_COMPANY;
  const address = agent.address.split("\n").map((line) => line.trim()).filter(Boolean).join(", ");
  const agentLine = [agent.name, agent.orgNumber && `org.nr ${agent.orgNumber}`, address].filter(Boolean).join(", ");
  return (
    <main>
      <PrivacyPage agentLine={agentLine} agentEmail={agent.email} />
      <SiteFooter />
    </main>
  );
}
