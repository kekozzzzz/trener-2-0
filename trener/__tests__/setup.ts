import { vi } from "vitest";

// next-intl's getTranslations требует контекст запроса (request scope), которого нет
// в юнит-тестах: они дёргают серверные экшены напрямую, без HTTP-запроса. В рантайме
// язык доходит до экшена корректно (проверено вживую: неверный логин → английская
// ошибка при английской локали). Здесь мокаем только i18n-границу и возвращаем русский
// текст из словаря — так ассерты на текст ошибок остаются осмысленными, а логика
// экшенов (сессии, токены, redirect) тестируется как прежде. Остальные экспорты
// next-intl/server сохраняем нетронутыми.
vi.mock("next-intl/server", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    getTranslations: async (arg?: string | { namespace?: string; locale?: string }) => {
      // next-intl принимает либо голую строку-namespace, либо объект {locale, namespace}
      // (так вызывает lib/seo.ts getMetaLocale — язык метатегов для ботов-краулеров
      // не зависит от request-контекста). Мок должен понимать оба вызова, иначе любой
      // код, перешедший на объектную форму, тихо получал бы пустой словарь (namespace
      // как ключ объекта в ru.json не находится) и видел бы сырые ключи вместо текста.
      const namespace = typeof arg === "string" ? arg : arg?.namespace;
      // messages/ru.json содержит и вложенные группы (напр. UploadGuide.networkLabels),
      // поэтому приводим через unknown — мок использует только плоские namespace→ключ→строка.
      const ru = (await import("../messages/ru.json")).default as unknown as Record<
        string,
        Record<string, string>
      >;
      const dict = (namespace ? ru[namespace] : undefined) ?? {};
      return (key: string, values?: Record<string, unknown>) => {
        let out = dict[key] ?? key;
        if (values) {
          for (const k of Object.keys(values)) {
            out = out.split(`{${k}}`).join(String(values[k]));
          }
        }
        return out;
      };
    },
  };
});
