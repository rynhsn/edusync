#!/usr/bin/env bash
# Menarik kode terbaru dari GitHub (cabang main), memasang dependensi, membangun web, menjalankan migrasi,
# lalu (re)start semua layanan. Dijalankan manual atau otomatis oleh GitHub Actions (.github/workflows/deploy.yml):
#   bash /opt/edusync/app/deploy/deploy.sh
set -euo pipefail

# Seluruh isi dibungkus fungsi: git reset di bawah bisa menimpa berkas ini saat sedang dibaca bash.
main() {
  local APP_DIR=/opt/edusync/app
  local BRANCH="${BRANCH:-main}"
  if [ ! -f "$APP_DIR/.env" ]; then
    echo "Jalankan deploy/init-env.sh dulu."
    exit 1
  fi

  run() {
    sudo -u edusync -H bash -c "cd $APP_DIR && set -a && . ./.env && set +a && $*"
  }

  echo "==> Kode terbaru (origin/${BRANCH})"
  sudo -u edusync -H git -C "$APP_DIR" fetch --prune origin "$BRANCH"
  sudo -u edusync -H git -C "$APP_DIR" reset --hard "origin/${BRANCH}"
  # Berkas systemd/Caddy dari repo dipasang ulang bila berubah.
  sudo cp "$APP_DIR"/deploy/systemd/edusync-*.service /etc/systemd/system/
  sudo systemctl daemon-reload

  echo "==> Dependensi"
  run pnpm install --frozen-lockfile
  echo "==> Build web (alamat API ikut tertanam saat build)"
  # .env berisi NODE_ENV=development (API menolak mode produksi dengan penyedia pembayaran dev), tetapi Next wajib production.
  run NODE_ENV=production pnpm --filter @edusync/web build
  echo "==> Migrasi database dan antrean"
  run pnpm db:migrate

  echo "==> Restart layanan"
  sudo systemctl restart edusync-api edusync-worker edusync-web
  sudo systemctl enable --now caddy >/dev/null
  sudo systemctl reload caddy || sudo systemctl restart caddy
  sleep 3
  systemctl --no-pager --lines=0 status edusync-api edusync-worker edusync-web caddy | grep -E "●|Active:" || true

  local DOMAIN
  DOMAIN=$(grep -E '^APP_DOMAIN=' "$APP_DIR/.env" | cut -d= -f2)
  echo
  echo "Selesai: $(sudo -u edusync -H git -C "$APP_DIR" log -1 --format='%h %s')"
  echo "Cek: curl -I https://${DOMAIN}/login"
}

main "$@"
exit
