#!/usr/bin/env bash
# Menyiapkan server Ubuntu (ARM atau x86) untuk Edusync: Node 26, pnpm, PostgreSQL 18, Caddy, pengguna layanan,
# dan firewall untuk port 80/443. Jalankan sekali sebagai pengguna biasa yang bisa sudo:  bash deploy/setup-server.sh
set -euo pipefail

NODE_MAJOR=26
PNPM_VERSION=12.16.1

if [ "$(id -u)" -eq 0 ]; then
  echo "Jalankan sebagai pengguna biasa (ubuntu), bukan root."
  exit 1
fi

echo "==> Paket dasar"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates gnupg openssl build-essential xz-utils \
  debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

echo "==> Node ${NODE_MAJOR}"
case "$(uname -m)" in
  aarch64 | arm64) NODE_ARCH=arm64 ;;
  x86_64 | amd64) NODE_ARCH=x64 ;;
  *)
    echo "Arsitektur tidak didukung: $(uname -m)"
    exit 1
    ;;
esac
BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
FILE=$(curl -fsSL "${BASE}/SHASUMS256.txt" | awk -v arch="linux-${NODE_ARCH}.tar.xz" '$2 ~ arch {print $2}')
if [ -z "$FILE" ]; then
  echo "Node ${NODE_MAJOR} untuk linux-${NODE_ARCH} tidak ditemukan di nodejs.org"
  exit 1
fi
curl -fsSL "${BASE}/${FILE}" -o "/tmp/${FILE}"
sudo rm -rf /opt/node
sudo mkdir -p /opt/node
sudo tar -xJf "/tmp/${FILE}" -C /opt/node --strip-components=1
for bin in node npm npx; do
  sudo ln -sf "/opt/node/bin/${bin}" "/usr/local/bin/${bin}"
done
sudo /opt/node/bin/npm install -g "pnpm@${PNPM_VERSION}"
sudo ln -sf /opt/node/bin/pnpm /usr/local/bin/pnpm
node --version
pnpm --version

echo "==> PostgreSQL 18"
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y postgresql-18

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "==> Pengguna layanan dan folder"
id edusync >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /opt/edusync --shell /usr/sbin/nologin edusync
sudo mkdir -p /opt/edusync
sudo chown edusync:edusync /opt/edusync

REPO_URL="${REPO_URL:-https://github.com/rynhsn/edusync.git}"
BRANCH="${BRANCH:-main}"
echo "==> Kode dari GitHub (${REPO_URL}, cabang ${BRANCH})"
if [ ! -d /opt/edusync/app/.git ]; then
  sudo -u edusync -H git clone --branch "$BRANCH" "$REPO_URL" /opt/edusync/app
fi

echo "==> Firewall server: port 80 dan 443 dibuka (22 sudah terbuka). Port 4000, 3000, dan 5432 sengaja tertutup."
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
sudo netfilter-persistent save

echo
echo "Selesai. Berikutnya: bash /opt/edusync/app/deploy/init-env.sh email-anda@contoh.com, lalu deploy/deploy.sh."
