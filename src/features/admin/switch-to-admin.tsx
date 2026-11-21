"use client";

import { useState } from "react";

/**
 * Byter från återförsäljarens inloggning till adminens, på samma adress. Panelen har en
 * inloggning i taget: knappen loggar ut och laddar om sidan, som då visar adminens
 * inloggning. Efter lösenordet öppnas sidan man försökte nå (`LoginForm` laddar om adressen).
 */
export function SwitchToAdmin() {
  const [busy, setBusy] = useState(false);
  const switchLogin = async () => {
    setBusy(true);
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    window.location.reload();
  };
  return (
    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void switchLogin()}>
      Logga in som admin
    </button>
  );
}
