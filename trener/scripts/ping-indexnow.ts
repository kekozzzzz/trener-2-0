import { pingIndexNow } from "../infrastructure/adapters/seo/indexnow";
import { getIndexNowUrls } from "../config/seo-indexnow";
import { getAppBaseUrl } from "../config/app";

// Ручной запуск после деплоя правок публичных страниц: npm run seo:ping
async function main() {
  const urls = getIndexNowUrls(getAppBaseUrl());
  const result = await pingIndexNow(urls);
  console.log(result.ok ? `OK (${result.status})` : `FAIL (${result.status})`, "—", urls.length, "urls");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
