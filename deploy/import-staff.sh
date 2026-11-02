#!/usr/bin/env bash
# Membuat staf platform pertama dari berkas hasil `staff:export` di laptop (hash kata sandi, bukan kata sandinya).
# Salin berkasnya ke server lebih dulu (scp), lalu:
#   bash deploy/import-staff.sh hi.edusync@gmail.com ~/staff-transfer.json
# Berkas dihapus setelah berhasil. Masuk memakai kata sandi yang sama seperti akun staf di lokal.
set -euo pipefail
APP_DIR=/opt/edusync/app
if [ $# -ne 2 ] || [ ! -f "$2" ]; then
  echo "Pemakaian: bash deploy/import-staff.sh <email-baru> <berkas.json>"
  exit 1
fi
FILE=$(mktemp)
trap 'rm -f "$FILE"' EXIT
cp "$2" "$FILE"
sudo chown edusync "$FILE"
sudo -u edusync -H bash -c "cd $APP_DIR && set -a && . ./.env && set +a && pnpm --filter @edusync/api staff:import \"\$0\" \"\$1\"" "$1" "$FILE"
shred -u "$2" 2>/dev/null || rm -f "$2"
echo "Berkas $2 dihapus."
