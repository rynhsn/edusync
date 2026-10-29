'use client';

import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardView() {
  const { school, can } = useSchool();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{school.schoolName}</h1>
        <p className="text-muted-foreground text-sm">Ringkasan akan terisi seiring modul ditambahkan.</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Akses Anda di sekolah ini</CardTitle>
          <CardDescription>Gabungan izin dari semua peran yang Anda pegang.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {school.permissions.length === 0 && (
              <span className="text-muted-foreground text-sm">Belum ada izin.</span>
            )}
            {[...school.permissions].sort().map((p) => (
              <Badge key={p} variant={can(p) ? 'secondary' : 'outline'}>
                {p}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
