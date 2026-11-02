#!/usr/bin/env bash
# Membuat akun staf platform pertama (admin). Kata sandi diketik tersembunyi, minimal 12 karakter.
#   bash deploy/create-staff.sh email@anda.com "Nama Anda"
set -euo pipefail
APP_DIR=/opt/edusync/app
if [ $# -ne 2 ]; then
  echo 'Pemakaian: bash deploy/create-staff.sh <email> "<nama>"'
  exit 1
fi
read -r -s -p "Kata sandi (minimal 12 karakter): " PW
echo
if [ "${#PW}" -lt 12 ]; then
  echo "Terlalu pendek."
  exit 1
fi
sudo -u edusync -H env STAFF_PASSWORD="$PW" bash -c "cd $APP_DIR && set -a && . ./.env && set +a && pnpm --filter @edusync/api create:staff \"\$0\" \"\$1\"" "$1" "$2"
