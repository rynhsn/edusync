#!/usr/bin/env bash
# Membuat database + peran, berkas .env berisi rahasia acak, konfigurasi Caddy, dan layanan systemd.
# Jalankan sekali setelah setup-server.sh dan setelah kode ada di /opt/edusync/app:
#   bash deploy/init-env.sh surel-anda@contoh.com                        # mode uji: pembayaran simulasi (tanpa uang asli)
#   bash deploy/init-env.sh surel-anda@contoh.com KUNCI_SERVER_MIDTRANS  # mode produksi dengan Midtrans
# Alamat publik dideteksi otomatis dan dipakai sebagai <IP-dengan-strip>.sslip.io (bisa ditimpa: DOMAIN=...).
set -euo pipefail

ACME_EMAIL="${1:-}"
MIDTRANS_KEY="${2:-}"
APP_DIR=/opt/edusync/app

if [ -z "$ACME_EMAIL" ]; then
  echo "Pemakaian: bash deploy/init-env.sh <email-untuk-sertifikat> [kunci-server-midtrans]"
  exit 1
fi
if [ ! -d "$APP_DIR" ]; then
  echo "Kode belum ada di $APP_DIR"
  exit 1
fi
if [ -f "$APP_DIR/.env" ]; then
  echo "$APP_DIR/.env sudah ada; hapus dulu bila ingin membuat ulang (database tidak disentuh)."
  exit 1
fi

IP="${PUBLIC_IP:-$(curl -4 -fsS https://api.ipify.org)}"
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
echo "==> Alamat publik: $IP   Domain dasar: $DOMAIN"

rand() { openssl rand -hex "$1"; }
OWNER_PW=$(rand 16)
APP_PW=$(rand 16)
PLATFORM_PW=$(rand 16)
AUTH_SECRET=$(rand 32)
PAYMENT_SECRET=$(rand 16)

echo "==> Database dan peran"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE edusync LOGIN PASSWORD '${OWNER_PW}' NOSUPERUSER;
CREATE DATABASE edusync OWNER edusync;
CREATE ROLE edusync_app LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE edusync_platform LOGIN PASSWORD '${PLATFORM_PW}' NOSUPERUSER BYPASSRLS;
GRANT CONNECT ON DATABASE edusync TO edusync_app, edusync_platform;
\connect edusync
ALTER DEFAULT PRIVILEGES FOR ROLE edusync IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edusync_app, edusync_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE edusync IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO edusync_app, edusync_platform;
GRANT USAGE ON SCHEMA public TO edusync_app, edusync_platform;
SQL

if [ -n "$MIDTRANS_KEY" ]; then
  NODE_ENV_VALUE=production
  PAYMENT=midtrans
else
  NODE_ENV_VALUE=development
  PAYMENT=dev
fi

echo "==> Berkas .env (NODE_ENV=${NODE_ENV_VALUE}, pembayaran ${PAYMENT})"
TMP=$(mktemp)
chmod 600 "$TMP"
cat >"$TMP" <<ENV
NODE_ENV=${NODE_ENV_VALUE}
DATABASE_OWNER_URL=postgres://edusync:${OWNER_PW}@127.0.0.1:5432/edusync
DATABASE_URL=postgres://edusync_app:${APP_PW}@127.0.0.1:5432/edusync
DATABASE_PLATFORM_URL=postgres://edusync_platform:${PLATFORM_PW}@127.0.0.1:5432/edusync
DATABASE_JOBS_URL=postgres://edusync:${OWNER_PW}@127.0.0.1:5432/edusync
API_PORT=4000
API_URL=http://127.0.0.1:4000
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=https://${DOMAIN}
TRUSTED_ORIGINS=https://${DOMAIN}
APP_DOMAIN=${DOMAIN}
WEB_URL=https://${DOMAIN}
PAYMENT_PROVIDER=${PAYMENT}
PAYMENT_DEV_SECRET=${PAYMENT_SECRET}
MIDTRANS_SERVER_KEY=${MIDTRANS_KEY}
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=Edusync <noreply@${DOMAIN}>
MESSAGING_PROVIDER=log
ENV
sudo install -o edusync -g edusync -m 600 "$TMP" "$APP_DIR/.env"
rm -f "$TMP"

echo "==> Caddy"
sed "s|__ACME_EMAIL__|${ACME_EMAIL}|" "$APP_DIR/deploy/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null

echo "==> Layanan systemd"
sudo cp "$APP_DIR"/deploy/systemd/edusync-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable edusync-api edusync-worker edusync-web >/dev/null

echo
echo "Selesai. Alamat utama: https://${DOMAIN}   Sekolah: https://<alamat-sekolah>.${DOMAIN}"
echo "Email (SMTP) masih diarahkan ke localhost, jadi kode OTP dan undangan belum terkirim sampai SMTP diisi di ${APP_DIR}/.env."
echo "Berikutnya: bash deploy/deploy.sh"
