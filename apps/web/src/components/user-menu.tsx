'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOut, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { authClient } from '@/lib/auth-client';

/** Keluar dari sesi: sama di semua kerangka (panel sekolah, konsol platform, portal lembaga). */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  };
}

/**
 * Kontrol sisi kanan kepala halaman, satu untuk semua kerangka: bahasa, tema, lalu menu pengguna
 * (avatar + nama, profil, keluar). `detail` menambah satu baris keterangan di label menu (mis. peran).
 */
export function UserMenu({
  profileHref,
  name,
  email,
  image,
  detail,
}: {
  profileHref: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  detail?: string;
}) {
  const tc = useTranslations('common');
  const tp = useTranslations('profile');
  const router = useRouter();
  const signOut = useSignOut();

  return (
    <div className="flex items-center gap-1">
      <LanguageSwitcher />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="h-auto gap-2 py-1" aria-label={name ?? undefined} />}
        >
          <Avatar className="size-7">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback>{(name ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-medium">{name}</span>
              <span className="text-muted-foreground block text-xs">{email}</span>
              {detail && <span className="text-muted-foreground block text-xs">{detail}</span>}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(profileHref)}>
            <UserCog className="size-4" /> {tp('menu')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="size-4" /> {tc('signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
