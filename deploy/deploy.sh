#!/usr/bin/env bash
# Memasang dependensi, membangun web, menjalankan migrasi, lalu (re)start semua layanan.
# Jalankan setelah init-env.sh, dan ulangi setiap kali kode diperbarui:  bash deploy/deploy.sh
set -euo pipefail
APP_DIR=/opt/edusync/app
if [ ! -f "$APP_DIR/.env" ]; then
  echo "Jalankan deploy/init-env.sh dulu."
  exit 1
fi

run() {
  sudo -u edusync -H bash -c "cd $APP_DIR && set -a && . ./.env && set +a && $*"
}

echo "==> Dependensi"
run pnpm install --frozen-lockfile
echo "==> Build web (alamat API ikut tertanam saat build)"
run pnpm --filter @edusync/web build
echo "==> Migrasi database dan antrean"
run pnpm db:migrate

echo "==> Restart layanan"
sudo systemctl restart edusync-api edusync-worker edusync-web
sudo systemctl enable --now caddy >/dev/null
sudo systemctl restart caddy
sleep 3
systemctl --no-pager --lines=0 status edusync-api edusync-worker edusync-web caddy | grep -E "●|Active:" || true

DOMAIN=$(grep -E '^APP_DOMAIN=' "$APP_DIR/.env" | cut -d= -f2)
echo
echo "Cek: curl -I https://${DOMAIN}/login"
echo "Buat akun staf platform pertama: bash deploy/create-staff.sh email@anda.com \"Nama Anda\""
