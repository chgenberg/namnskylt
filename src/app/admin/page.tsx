import type { Metadata } from "next";
import { AdminPage } from "@/features/admin/admin-page";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminRoute() {
  return (
    <main>
      <AdminPage />
    </main>
  );
}
