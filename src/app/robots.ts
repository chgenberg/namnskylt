import type { MetadataRoute } from "next";

/** Personliga länkar och butiksförhandsvisningar ska aldrig hamna i sökmotorer. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/for/", "/avregistrera/", "/utskick/", "/aterforsaljare/", "/admin", "/api/"],
    },
  };
}
