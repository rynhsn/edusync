// Membuat rilis: pnpm release 1.2.0
// Syarat: pohon git bersih, di cabang main, dan CHANGELOG.md sudah punya bagian "## [1.2.0]".
// Hasil: package.json dinaikkan, satu commit "Rilis v1.2.0", dan tag v1.2.0. Push tag itulah yang men-deploy produksi.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`Gagal: ${msg}`);
  process.exit(1);
};

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('pakai format x.y.z, contoh: pnpm release 1.2.0');
// Dibandingkan dengan main di GitHub (bukan nama cabang lokal): cabang kerja boleh bernama lain, asal sama persis.
git('fetch', 'edusync', 'main');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'FETCH_HEAD')) {
  fail('HEAD harus sama dengan main di GitHub (push dulu, atau pindah ke commit yang sama)');
}
if (git('status', '--porcelain')) fail('ada perubahan yang belum di-commit');
if (git('tag', '--list', `v${version}`)) fail(`tag v${version} sudah ada`);

const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes(`## [${version}]`)) fail(`CHANGELOG.md belum punya bagian "## [${version}]"`);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

git('add', 'package.json');
git('commit', '-m', `Rilis v${version}`);
git('tag', '-a', `v${version}`, '-m', `Edusync v${version}`);
console.log(
  `Siap. Kirim ke GitHub (ini yang men-deploy produksi):\n  git push edusync HEAD:main v${version}`,
);
