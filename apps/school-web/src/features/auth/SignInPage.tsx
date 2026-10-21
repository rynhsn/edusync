import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient, authErrorMessage } from '@/lib/school-api';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Field, FormError } from '@/features/shared';

export function SignInPage() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [showPassword, setShowPassword] = useState(false); const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { const result = await authClient.signIn.email({ email: String(data.get('email')), password: String(data.get('password')) }); if (result.error) throw new Error(result.error.message ?? 'Check your email and password.'); navigate('/', { replace: true }); } catch (cause) { setError(authErrorMessage(cause)); } finally { setBusy(false); } };
  return <AuthLayout eyebrow="SCHOOL ACCESS" title="Welcome back" description="Sign in to manage your school's students, classes and academic years."><form onSubmit={(event) => void submit(event)} className="space-y-5"><Field label="Email address" name="email" type="email" required autoComplete="username" placeholder="you@school.sch.id" /><div className="space-y-1.5"><Label htmlFor="password">Password</Label><div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" className="pr-11" placeholder="Your password" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>{error && <FormError message={error} />}<Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? 'Signing in…' : 'Sign in to School'}</Button></form><div className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-muted-foreground"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-primary" />Accounts are created by the EduSync platform team when your school is set up. Contact them if you cannot sign in.</div></AuthLayout>;
}
