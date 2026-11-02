import { type Db, eq, platformSetting } from '@edusync/db';
import { DomainError } from './errors';
import { decryptSecret, encryptSecret } from './settings';

const SMTP_KEY = 'smtp';

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS langsung (biasanya port 465). Port lain memakai STARTTLS bila server menawarkannya. */
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
}

interface StoredSmtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  passwordEnc?: string;
  from: string;
}

async function readStored(db: Db): Promise<StoredSmtp | null> {
  const [row] = await db.select().from(platformSetting).where(eq(platformSetting.key, SMTP_KEY));
  return (row?.value as unknown as StoredSmtp | undefined) ?? null;
}

export interface SmtpSettingsView {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  from: string;
  /** Dari mana pengaturan yang berlaku: database, atau variabel lingkungan bila belum diatur di konsol. */
  source: 'database' | 'environment';
}

export async function smtpSettingsView(db: Db, base: SmtpConfig): Promise<SmtpSettingsView> {
  const stored = await readStored(db);
  if (!stored) {
    return {
      host: base.host,
      port: base.port,
      secure: base.secure,
      user: base.user ?? '',
      hasPassword: Boolean(base.password),
      from: base.from,
      source: 'environment',
    };
  }
  return {
    host: stored.host,
    port: stored.port,
    secure: stored.secure,
    user: stored.user ?? '',
    hasPassword: Boolean(stored.passwordEnc),
    from: stored.from,
    source: 'database',
  };
}

export interface SmtpSettingsInput {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  /** Kosong atau tidak diisi = pertahankan kata sandi yang tersimpan. */
  password?: string | undefined;
  from: string;
  /** Hapus kata sandi dan nama pengguna tersimpan (server tanpa login, misalnya Mailpit). */
  clearAuth?: boolean | undefined;
}

/** Simpan pengaturan SMTP; kata sandi dienkripsi dan tidak pernah dikembalikan. */
export async function saveSmtpSettings(db: Db, secret: string, staffId: string, input: SmtpSettingsInput) {
  const stored = await readStored(db);
  const user = input.clearAuth ? '' : (input.user ?? '').trim();
  const newPassword = input.password?.trim();
  const passwordEnc =
    input.clearAuth || !user
      ? undefined
      : newPassword
        ? encryptSecret(newPassword, secret)
        : stored?.passwordEnc;
  if (user && !passwordEnc) {
    throw new DomainError(
      400,
      'smtp_password_required',
      'Kata sandi SMTP wajib diisi bila memakai nama pengguna.',
    );
  }
  const value: StoredSmtp = {
    host: input.host.trim(),
    port: input.port,
    secure: input.secure,
    from: input.from.trim(),
    ...(user ? { user } : {}),
    ...(passwordEnc ? { passwordEnc } : {}),
  };
  await db
    .insert(platformSetting)
    .values({ key: SMTP_KEY, value: value as unknown as Record<string, unknown>, updatedBy: staffId })
    .onConflictDoUpdate({
      target: platformSetting.key,
      set: { value: value as unknown as Record<string, unknown>, updatedBy: staffId, updatedAt: new Date() },
    });
}

/** Konfigurasi SMTP yang berlaku: pengaturan di database menimpa variabel lingkungan. */
export async function resolveSmtpConfig(db: Db, secret: string, base: SmtpConfig): Promise<SmtpConfig> {
  const stored = await readStored(db);
  if (!stored) return base;
  return {
    host: stored.host,
    port: stored.port,
    secure: stored.secure,
    from: stored.from,
    user: stored.user,
    password: stored.passwordEnc ? decryptSecret(stored.passwordEnc, secret) : undefined,
  };
}

/** Pembaca konfigurasi SMTP dengan cache singkat supaya perubahan di konsol berlaku tanpa restart. */
export class SmtpResolver {
  private cached: { at: number; config: SmtpConfig } | null = null;

  constructor(
    private readonly db: Db,
    private readonly secret: string,
    private readonly base: SmtpConfig,
    private readonly ttlMs = 15_000,
  ) {}

  async get(): Promise<SmtpConfig> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.config;
    const config = await resolveSmtpConfig(this.db, this.secret, this.base);
    this.cached = { at: Date.now(), config };
    return config;
  }

  invalidate() {
    this.cached = null;
  }
}
