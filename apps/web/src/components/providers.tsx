'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { isSchoolSuspendedError } from '@/lib/school-suspension';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    // Sekolah yang ditangguhkan saat halaman sudah terbuka (atau tautan langsung): panggilan data mana pun yang
    // dijawab 403 school_suspended memaksa status sekolah dibaca ulang, sehingga kerangka menampilkan layar penangguhan.
    const onError = (error: unknown) => {
      if (isSchoolSuspendedError(error)) void qc.invalidateQueries({ queryKey: ['me'] });
    };
    const qc: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    return qc;
  });
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
