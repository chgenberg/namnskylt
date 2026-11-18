import Image from "next/image";
import type { SellerProfile } from "@/lib/company/seller";
import styles from "./quote-public.module.css";

interface SellerLogoProps {
  company: SellerProfile;
  /** Mörk platta bakom en ljus logga på genomskinlig botten. */
  plate: string | null;
}

/** Säljarens märke överst på offerten och kundens ordersida: sajtens logga, säljarens egen logga eller namnet. */
export function SellerLogo({ company, plate }: SellerLogoProps) {
  if (company.site) {
    return <Image src="/logo-namnskylt.svg" alt="namnskylt.com" width={504} height={97} unoptimized className={styles.logo} priority />;
  }
  if (!company.logo) return <p className={styles.brandName}>{company.name}</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL ur inställningarna
    <img
      src={company.logo}
      alt={company.name}
      className={styles.logo}
      style={plate ? { background: plate, padding: "6px 12px", borderRadius: 10 } : undefined}
    />
  );
}
