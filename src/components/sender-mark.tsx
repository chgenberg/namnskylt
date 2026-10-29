import Image from "next/image";
import { googleFontsHref } from "@/lib/shops/model";
import type { Sender } from "@/lib/shops/sender";

interface SenderMarkProps {
  sender: Sender;
  className?: string;
  nameClassName?: string;
}

/** Avsändarens logga — vår bara när det är vår egen webbshop. */
export function SenderMark({ sender, className, nameClassName }: SenderMarkProps) {
  if (sender.ours) {
    return <Image src="/logo-namnskylt.svg" alt="namnskylt.com" width={504} height={97} unoptimized className={className} priority />;
  }
  if (!sender.logo) return <p className={nameClassName}>{sender.name}</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL ur butikens eller företagets profil
    <img
      src={sender.logo}
      alt={sender.name}
      className={className}
      style={sender.logoPlate ? { background: sender.logoPlate, padding: "6px 12px", borderRadius: 10 } : undefined}
    />
  );
}

/** Avsändarens typsnitt från Google Fonts. */
export function SenderFonts({ sender }: { sender: Sender }) {
  if (sender.webFamilies.length === 0) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {sender.webFamilies.map((family) => (
        <link key={family} rel="stylesheet" href={googleFontsHref(family)} precedence="default" />
      ))}
    </>
  );
}
