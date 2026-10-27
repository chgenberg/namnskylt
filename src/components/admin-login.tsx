"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import styles from "./site-header.module.css";

export function AdminLogin() {
  const router = useRouter();
  const { session, ready, login, logout } = useAdminSession();
  if (!ready) return <span className={styles.adminSlot} aria-hidden />;

  if (!session) {
    return (
      <button
        type="button"
        className={`${styles.link} ${styles.login}`}
        onClick={() => {
          login();
          router.push("/admin");
        }}
      >
        Logga in
      </button>
    );
  }
  return (
    <div className={styles.adminSlot}>
      <Link href="/admin" className={`${styles.link} ${styles.admin}`}>
        <span className={styles.avatar} aria-hidden>
          {session.name.slice(0, 1)}
        </span>
        <span className={styles.adminText}>Admin</span>
      </Link>
      <button type="button" className={`${styles.link} ${styles.logout}`} onClick={logout}>
        Logga ut
      </button>
    </div>
  );
}
