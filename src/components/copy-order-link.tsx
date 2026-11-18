"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { freshCopyHref } from "@/lib/designer-work/model";

interface CopyOrderLinkProps {
  /** Adressen till skyltmotorn med ordern som ska kopieras. */
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * Öppnar skyltmotorn med en tidigare orders skyltar, som en ny order. Varje klick ger en ny
 * kopia av ordern som den lades: adressen får ett märke (`freshCopyHref`), så att ändringar
 * från en tidigare kopia inte kommer tillbaka och ser ut som ändringar i den gamla ordern.
 */
export function CopyOrderLink({ href, className, children }: CopyOrderLinkProps) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        // Ny flik eller nytt fönster öppnar adressen som den är.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        router.push(freshCopyHref(href));
      }}
    >
      {children}
    </Link>
  );
}
