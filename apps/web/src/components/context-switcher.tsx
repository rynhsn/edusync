'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronsUpDown, GraduationCap, ShieldCheck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, unwrap } from '@/lib/api';
import { goToSchool, useSite } from '@/lib/site';

/**
 * Pindah konteks seperti pindah sekolah: konsol platform, portal pemilik lembaga, dan tiap sekolah tempat
 * pengguna menjadi anggota. Hanya tampil bila pengguna punya lebih dari satu konteks.
 *
 * Dipasang di kepala sidebar semua kerangka (konsol platform, portal pemilik, panel sekolah) dengan tampilan
 * yang sama. `subtitle` = keterangan di bawah nama konteks (mis. peran). `alwaysShow` menampilkannya walau hanya
 * ada satu konteks (panel sekolah selalu menampilkan sekolahnya).
 */
export function ContextSwitcher({
  subtitle,
  alwaysShow = false,
}: {
  subtitle?: string;
  alwaysShow?: boolean;
}) {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const site = useSite();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.GET('/v1/me');
      return res.response.status === 401 ? null : unwrap(res);
    },
  });
  // Kunci terpisah dari ['account'] dan ['platform-me'] karena yang di sini menelan galat (bukan staf = tanpa menu).
  const staff = useQuery({
    queryKey: ['context', 'platform'],
    enabled: !!me.data,
    retry: false,
    queryFn: async () => {
      const res = await api.GET('/v1/platform/me');
      return res.response.ok ? unwrap(res) : null;
    },
  });
  const owner = useQuery({
    queryKey: ['context', 'owner'],
    enabled: !!me.data,
    retry: false,
    queryFn: async () => {
      const res = await api.GET('/v1/account');
      return res.response.ok ? unwrap(res) : null;
    },
  });

  if (!me.data || !site.ready) return null;

  const isStaff = !!staff.data;
  const isOwner = (owner.data?.foundations.length ?? 0) > 0;
  const schools = me.data.memberships;
  const total = (isStaff ? 1 : 0) + (isOwner ? 1 : 0) + schools.length;
  if (!alwaysShow && total < 2) return null;

  const here = pathname.startsWith('/platform')
    ? 'platform'
    : pathname.startsWith('/account')
      ? 'owner'
      : site.kind === 'school'
        ? `school:${site.slug}`
        : null;
  const hereLabel =
    here === 'platform'
      ? t('contextPlatform')
      : here === 'owner'
        ? t('contextOwner')
        : (schools.find((m) => `school:${m.schoolSlug}` === here)?.schoolName ?? t('switchContext'));

  // Konsol dan portal pemilik hidup di alamat utama; dari alamat sekolah sesi dipindah dulu lewat token sekali pakai.
  const goMain = (path: string) =>
    site.kind === 'main' ? router.push(path) : void goToSchool(site, null, path).catch(() => undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="bg-card h-auto justify-between py-2 md:w-full" />}
      >
        <span className="truncate text-left">
          <span className="block truncate text-sm font-medium">{hereLabel}</span>
          {subtitle && <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60">
        {(isStaff || isOwner) && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('switchContext')}</DropdownMenuLabel>
            {isStaff && (
              <DropdownMenuItem onClick={() => here !== 'platform' && goMain('/platform')}>
                <ShieldCheck className="size-4" aria-hidden />
                <span className="flex-1 truncate">{t('contextPlatform')}</span>
                {here === 'platform' && <Badge variant="secondary">{t('active')}</Badge>}
              </DropdownMenuItem>
            )}
            {isOwner && (
              <DropdownMenuItem onClick={() => here !== 'owner' && goMain('/account')}>
                <Building2 className="size-4" aria-hidden />
                <span className="flex-1 truncate">{t('contextOwner')}</span>
                {here === 'owner' && <Badge variant="secondary">{t('active')}</Badge>}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
        {schools.length > 0 && (
          <>
            {(isStaff || isOwner) && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('contextSchools')}</DropdownMenuLabel>
              {schools.map((m) => (
                <DropdownMenuItem
                  key={m.schoolId}
                  onClick={() => here !== `school:${m.schoolSlug}` && void goToSchool(site, m.schoolSlug)}
                >
                  <GraduationCap className="size-4" aria-hidden />
                  <span className="flex-1 truncate">{m.schoolName}</span>
                  {here === `school:${m.schoolSlug}` && <Badge variant="secondary">{t('active')}</Badge>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
