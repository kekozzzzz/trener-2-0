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

# ============ ФАЗА B: сертификат с самоповтором ============
# Кладём самостоятельный retry-скрипт и cron, который дёргает его раз в 10 минут,
# пока сертификат не выпустится. Проверка простая и надёжная: домен указывает на
# наш статический IP. Раз в 10 минут — чтобы не упереться в лимиты Let's Encrypt.
OURIP="81.26.186.177"

sudo tee /usr/local/bin/whygrid-cert.sh >/dev/null 2>&1 <<CERT
#!/usr/bin/env bash
LOG="/home/trener-vm/bootstrap.log"
[ -d /etc/letsencrypt/live/$DOMAIN ] && exit 0
getent ahostsv4 $DOMAIN 2>/dev/null | grep -q '$OURIP' || { echo "\$(date -u +%FT%TZ) | cert-retry: DNS ещё не на нас" >> "\$LOG"; exit 0; }
command -v certbot >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx >> "\$LOG" 2>&1
echo "\$(date -u +%FT%TZ) | cert-retry: выпускаю сертификат..." >> "\$LOG"
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect >> "\$LOG" 2>&1
if [ -d /etc/letsencrypt/live/$DOMAIN ]; then
  sudo systemctl reload nginx >> "\$LOG" 2>&1
  echo "\$(date -u +%FT%TZ) | cert-retry: ГОТОВО, сертификат выпущен" >> "\$LOG"
fi
CERT
sudo chmod +x /usr/local/bin/whygrid-cert.sh 2>/dev/null

sudo tee /etc/cron.d/whygrid-cert >/dev/null 2>&1 <<'CRON'
*/10 * * * * trener-vm /usr/local/bin/whygrid-cert.sh
CRON

say "установлен авто-выпуск сертификата (cron каждые 10 мин); пробую прямо сейчас..."
sudo /usr/local/bin/whygrid-cert.sh
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  say "ГОТОВО: сертификат выпущен, https работает напрямую"
else
  say "сертификат ещё не выпущен — cron добьёт в течение 10 мин (nginx на 80 уже готов)"
fi

exit 0
