import { decryptSecret, encryptSecret } from '@edusync/billing';
import { and, type Db, eq, inArray, sql, waAuthState } from '@edusync/db';
import {
  type AuthenticationCreds,
  BufferJSON,
  initAuthCreds,
  proto,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from '@whiskeysockets/baileys';

export interface DbAuthState {
  state: { creds: AuthenticationCreds; keys: SignalKeyStore };
  saveCreds: () => Promise<void>;
  /** Hapus seluruh kredensial sekolah ini (logout atau sesi tak terbaca); tautan harus diulang. */
  clear: () => Promise<void>;
}

const CREDS = 'creds';

/**
 * Auth state Baileys di tabel wa_auth_state: satu baris per kunci, nilai dienkripsi (AES-256-GCM dari AUTH_SECRET).
 * Dipilih ketimbang berkas karena tahan restart/pindah server, ikut cadangan DB, dan tidak menumpuk puluhan ribu berkas
 * kecil (useMultiFileAuthState sendiri tidak disarankan untuk produksi). Kredensial tidak pernah dicatat ke log.
 */
export async function useDbAuthState(db: Db, schoolId: string, secret: string): Promise<DbAuthState> {
  const seal = (value: unknown) => encryptSecret(JSON.stringify(value, BufferJSON.replacer), secret);
  const open = (blob: string) => JSON.parse(decryptSecret(blob, secret), BufferJSON.reviver);
  const mine = eq(waAuthState.schoolId, schoolId);

  const clear = async () => {
    await db.delete(waAuthState).where(mine);
  };

  const upsert = (rows: { key: string; value: unknown }[]) =>
    db
      .insert(waAuthState)
      .values(rows.map((r) => ({ schoolId, key: r.key, value: seal(r.value) })))
      .onConflictDoUpdate({
        target: [waAuthState.schoolId, waAuthState.key],
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });

  let creds: AuthenticationCreds;
  const [row] = await db
    .select({ value: waAuthState.value })
    .from(waAuthState)
    .where(and(mine, eq(waAuthState.key, CREDS)));
  if (row) {
    try {
      creds = open(row.value);
    } catch {
      // Sesi tak terbaca (mis. AUTH_SECRET diganti): buang dan mulai tautan baru, jangan menggantung.
      await clear();
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  const keys: SignalKeyStore = {
    get: async (type, ids) => {
      const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
      if (ids.length === 0) return out;
      const rows = await db
        .select({ key: waAuthState.key, value: waAuthState.value })
        .from(waAuthState)
        .where(
          and(
            mine,
            inArray(
              waAuthState.key,
              ids.map((id) => `${type}:${id}`),
            ),
          ),
        );
      for (const r of rows) {
        try {
          let value = open(r.value);
          if (type === 'app-state-sync-key' && value)
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          out[r.key.slice(type.length + 1)] = value;
        } catch {
          // Baris rusak dianggap tidak ada; Baileys meminta ulang kuncinya.
        }
      }
      return out;
    },
    set: async (data) => {
      const writes: { key: string; value: unknown }[] = [];
      const removals: string[] = [];
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries ?? {})) {
          if (value) writes.push({ key: `${type}:${id}`, value });
          else removals.push(`${type}:${id}`);
        }
      }
      if (writes.length > 0) await upsert(writes);
      if (removals.length > 0) {
        await db.delete(waAuthState).where(and(mine, inArray(waAuthState.key, removals)));
      }
    },
    clear,
  };

  return {
    state: { creds, keys },
    saveCreds: async () => void (await upsert([{ key: CREDS, value: creds }])),
    clear,
  };
}
