'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = Omit<React.ComponentProps<typeof Input>, 'type'>;

/** Kolom kata sandi dengan tombol lihat/sembunyikan. Tombol tidak ikut tab-urutan kolom dan punya label bagi pembaca layar. */
export function PasswordInput({ className, ...props }: Props) {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);
  const label = visible ? t('hidePassword') : t('showPassword');

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg outline-none focus-visible:ring-3"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
