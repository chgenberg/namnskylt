import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteBrand } from "@/lib/email/layout";
import { composeCustomerResetEmail } from "./reset-email";

describe("kundens mejl för nytt lösenord", () => {
  const url = "https://www.namnskylt.com/butik/exempel/konto/losenord/0123456789abcdef0123456789abcdef";

  it("bär butikens namn i en butik och nämner inte namnskylt.com", () => {
    const mail = composeCustomerResetEmail({
      to: "kund@example.se",
      url,
      from: '"Exempelbutiken" <besked@example.se>',
      replyTo: "butik@example.se",
      sellerName: "Exempelbutiken",
      brand: { name: "Exempelbutiken", logo: null, accent: "#0057B8" },
    });
    assert.equal(mail.subject, "Välj ett nytt lösenord");
    assert.match(mail.text, /ditt konto hos Exempelbutiken/);
    assert.match(mail.html, new RegExp(url));
    assert.doesNotMatch(`${mail.text}${mail.html}`, /namnskylt\.com –|en del av Skylt/);
    assert.match(mail.text, /2 timmar/);
  });

  it("bär namnskylt.coms utseende på namnskylt.com", () => {
    const mail = composeCustomerResetEmail({
      to: "kund@example.se",
      url: "https://www.namnskylt.com/konto/losenord/0123456789abcdef0123456789abcdef",
      from: "namnskylt.com <besked@example.se>",
      replyTo: "besked@example.se",
      sellerName: "namnskylt.com",
      brand: siteBrand("https://www.namnskylt.com"),
    });
    assert.match(mail.text, /ditt konto hos namnskylt\.com/);
  });
});
