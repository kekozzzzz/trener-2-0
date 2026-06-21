#!/usr/bin/env bash
# Разовый настройщик прода: ставит nginx как обратный прокси на 80/443 → :3000
# и выпускает сертификат Let's Encrypt, КАК ТОЛЬКО whygrid.app начнёт указывать
# на этот сервер напрямую (после переключения DNS мимо Cloudflare).
#
# Безопасность исполнения:
#  - запускается ТОЛЬКО под пользователем trener-vm (на CI/локали — выходит молча);
#  - никогда не валит вызывающий процесс: все ошибки гасятся, выход всегда 0;
#  - идемпотентен: можно запускать каждый деплой-цикл, лишнего не делает;
#  - certbot дёргается только когда DNS уже указывает на нас (чтобы не жечь лимиты LE).
#
# После того как всё настроено — postinstall-хук в package.json убирается отдельным
# коммитом, и этот скрипт перестаёт вызываться.

set +e

# --- гейт: только на боевом сервере ---
[ "$(id -un 2>/dev/null)" = "trener-vm" ] || exit 0

# --- не запускать две копии разом ---
exec 9>/tmp/server-bootstrap.lock 2>/dev/null
flock -n 9 2>/dev/null || exit 0

DOMAIN="whygrid.app"
EMAIL="artemkekoz@gmail.com"
LOG="/home/trener-vm/bootstrap.log"

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
STATUS_FILE="$APP_DIR/public/_setup-status.txt"

say() {
  local msg="$(date -u +%FT%TZ) | $1"
  echo "$msg" >> "$LOG" 2>/dev/null
  echo "$msg" > "$STATUS_FILE" 2>/dev/null
}

say "bootstrap: старт"

# --- нужен беспарольный sudo ---
if ! sudo -n true 2>/dev/null; then
  say "СТОП: нет беспарольного sudo — поставить nginx не могу"
  exit 0
fi

# ============ ФАЗА A: nginx как обратный прокси ============
if ! command -v nginx >/dev/null 2>&1; then
  say "ставлю nginx..."
  sudo apt-get update -y >>"$LOG" 2>&1
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx >>"$LOG" 2>&1
fi

if command -v nginx >/dev/null 2>&1; then
  # map для веб-сокетов
  sudo tee /etc/nginx/conf.d/upgrade.conf >/dev/null 2>&1 <<'MAP'
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
MAP

  # сайт: 80 → приложение на :3000 (default_server, чтобы ловить и заход по IP)
  sudo tee /etc/nginx/sites-available/whygrid >/dev/null 2>&1 <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name whygrid.app;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
NGINX

  sudo ln -sf /etc/nginx/sites-available/whygrid /etc/nginx/sites-enabled/whygrid 2>/dev/null
  sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null

  if sudo nginx -t >>"$LOG" 2>&1; then
    sudo systemctl enable nginx >>"$LOG" 2>&1
    sudo systemctl restart nginx >>"$LOG" 2>&1
    say "nginx настроен и запущен (80 → :3000)"
  else
    say "ОШИБКА: nginx -t не прошёл, конфиг не применён"
    exit 0
  fi
else
  say "СТОП: nginx так и не установился"
  exit 0
fi

# ============ ФАЗА B: сертификат с самоповтором + отчёт ============
# retry-скрипт + cron каждые 10 мин (чтобы не упереться в лимиты Let's Encrypt).
# Принудительно ставим nginx-плагин (частая поломка — certbot есть, плагина нет).
# Шлёт отчёт о результате на временный приёмник, чтобы можно было увидеть причину.
OURIP="81.26.186.177"
WEBHOOK="https://webhook.site/52d41d9e-37b2-4713-ba7e-0223b721af66"

sudo tee /usr/local/bin/whygrid-cert.sh >/dev/null 2>&1 <<CERT
#!/usr/bin/env bash
LOG="/home/trener-vm/bootstrap.log"
report() { curl -s --max-time 15 -X POST --data-binary "\$1" "$WEBHOOK" >/dev/null 2>&1; }

if [ -d /etc/letsencrypt/live/$DOMAIN ]; then
  report "cert: УЖЕ ВЫПУЩЕН на \$(hostname)"; exit 0
fi
if ! getent ahostsv4 $DOMAIN 2>/dev/null | grep -q '$OURIP'; then
  report "cert: DNS $DOMAIN ещё не на $OURIP -> \$(getent ahostsv4 $DOMAIN 2>/dev/null | head -1)"; exit 0
fi
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx >> "\$LOG" 2>&1
OUT=\$(sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect 2>&1)
echo "\$OUT" >> "\$LOG"
if [ -d /etc/letsencrypt/live/$DOMAIN ]; then
  sudo systemctl reload nginx >> "\$LOG" 2>&1
  report "cert: ГОТОВО, выпущен на \$(hostname)"
else
  report "cert: НЕ ВЫПУЩЕН. certbot-хвост: \$(echo "\$OUT" | tail -20) ||| nginx-t: \$(sudo nginx -t 2>&1 | tail -3)"
fi
CERT
sudo chmod +x /usr/local/bin/whygrid-cert.sh 2>/dev/null

sudo tee /etc/cron.d/whygrid-cert >/dev/null 2>&1 <<'CRON'
*/10 * * * * trener-vm /usr/local/bin/whygrid-cert.sh
CRON

say "пробую выпустить сертификат и шлю отчёт..."
sudo /usr/local/bin/whygrid-cert.sh
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  say "ГОТОВО: сертификат выпущен, https работает напрямую"
else
  say "сертификат ещё не выпущен — отчёт отправлен, cron добьёт в течение 10 мин"
fi

exit 0
