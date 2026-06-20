// Сетевые утилиты: сопоставление IPv4 с CIDR-диапазоном (для аллоулиста вебхуков).
// Лёгкая чистая логика без зависимостей — тестируется напрямую.

// IPv4 "a.b.c.d" → 32-битное беззнаковое число. null — если строка не IPv4.
function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

// Входит ли ip в диапазон. range — одиночный IP ("1.2.3.4") или CIDR ("1.2.3.0/24").
export function ipv4InRange(ip: string, range: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;

  const [base, bitsRaw] = range.trim().split("/");
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;

  if (bitsRaw === undefined) return ipInt === baseInt; // одиночный IP

  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;

  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// Совпадает ли ip хотя бы с одним диапазоном из списка.
export function ipv4InAnyRange(ip: string, ranges: string[]): boolean {
  return ranges.some((range) => ipv4InRange(ip, range));
}
