import { noindex } from "@/lib/seo";
export const metadata = noindex;
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/features/auth/session";
import { StatusClient } from "./status-client";

export default async function StatusPage() {
  await requireSession();
  const t = await getTranslations("Status");

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", maxWidth: "800px" }}>
      <h1>{t("pageTitle")}</h1>
      <p>
        <a href="/analyze">{t("uploadFile")}</a>
      </p>
      <StatusClient />
    </main>
  );
}
