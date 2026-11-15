import "server-only";
import type { BadgeDocument } from "@/engine";
import { downloadFileName, logoOriginalHref } from "@/lib/logo-images/original-model";
import { logoOriginalsOf } from "@/lib/logo-images/originals";
import styles from "./admin.module.css";

interface LogoOriginalLinksProps {
  badges: readonly BadgeDocument[];
}

const size = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${size.format(bytes / (1024 * 1024))} MB` : `${size.format(Math.max(1, Math.round(bytes / 1024)))} kB`;
}

/**
 * Filerna loggorna på skyltarna lästes från, en länk per fil. Verkstaden får
 * dem härifrån när tryck eller gravyr kräver bättre underlag än det som ligger
 * i skylten. Visar ingenting för skyltar utan sparad fil.
 */
export async function LogoOriginalLinks({ badges }: LogoOriginalLinksProps) {
  const files = await logoOriginalsOf(badges).catch(() => []);
  if (files.length === 0) return null;
  return (
    <div className={styles.muted} style={{ marginTop: "var(--space-3)", display: "grid", gap: "var(--space-1)" }}>
      {files.map((file) => (
        <p key={file.id}>
          <a href={logoOriginalHref(file.id)} download className={styles.link}>
            Originalfil för loggan
          </a>{" "}
          {downloadFileName(file.id, file.name, file.mime)} · {fileSize(file.sizeBytes)}
        </p>
      ))}
    </div>
  );
}
