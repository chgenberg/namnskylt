import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { AboutPage } from "@/features/about/about-page";

export const metadata: Metadata = {
  title: "Om oss",
  description:
    "namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar. Vi gör skyltarna i vår produktion i Göteborg och levererar till hela Sverige.",
};

export default function OmOssPage() {
  return (
    <main>
      <AboutPage />
      <SiteFooter />
    </main>
  );
}
