/**
 * Sant när förfrågan bär JSON och kommer från sajten själv.
 *
 * Ett formulär på en annan sajt kan skicka text som går att läsa som JSON,
 * och svaret får sätta kakor. Utan den här kontrollen kunde en främmande sida
 * logga in besökaren på någon annans konto, så att besökarens nästa order och
 * uppgifter hamnade där. Ett formulär kan däremot inte ange `application/json`,
 * och webbläsaren säger själv varifrån anropet kommer (`Sec-Fetch-Site`).
 * Anrop utan den raden kommer inte från en webbläsare och släpps igenom.
 */
export function isSameSiteJson(request: Request): boolean {
  const type = (request.headers.get("content-type") ?? "").trim().toLowerCase();
  if (type !== "application/json" && !type.startsWith("application/json;")) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}
