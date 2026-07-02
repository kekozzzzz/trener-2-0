// Типы для geoip-country (у пакета своих нет). Используем только lookup().country;
// остальные поля ответа перечислены по факту, но нам не нужны.
declare module "geoip-country" {
  export type GeoLookupResult = {
    country: string; // ISO-код («RU», «US», …)
    name?: string;
    native?: string;
    continent?: string;
    continent_name?: string;
  };

  export function lookup(ip: string): GeoLookupResult | null;
}
