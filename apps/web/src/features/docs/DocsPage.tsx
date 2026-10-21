import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DOC_SCOPE, DOC_SCOPE_ICON, DOC_SECTIONS } from '@/features/docs/content';
import { useTranslation } from '@/i18n';

export function DocsPage() {
  const { locale } = useTranslation();
  return <div className="space-y-6"><div className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><DOC_SCOPE_ICON size={18} /></span><p className="text-sm leading-6 text-muted-foreground">{DOC_SCOPE[locale]}</p></div><div className="grid gap-5 lg:grid-cols-2">{DOC_SECTIONS.map((section) => <Card key={section.id}><CardHeader className="flex-row items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><section.icon size={18} /></span><div><CardTitle>{section.title[locale]}</CardTitle><CardDescription>{section.description[locale]}</CardDescription></div></CardHeader><CardContent className="space-y-4"><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">{section.items[locale].map((item) => <li key={item}>{item}</li>)}</ul>{section.endpoints && <div className="rounded-xl border border-border bg-muted p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">API</p><ul className="space-y-1 font-mono text-xs leading-5 text-foreground/80">{section.endpoints.map((endpoint) => <li key={endpoint}>{endpoint}</li>)}</ul></div>}</CardContent></Card>)}</div></div>;
}
