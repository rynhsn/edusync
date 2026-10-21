import { Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LanguageProvider } from '@/i18n';
import { AuthenticatedApp } from '@/features/shell/AuthenticatedApp';
import { SignInPage } from '@/features/auth/SignInPage';
import { SignUpPage } from '@/features/auth/SignUpPage';
import { PasswordResetPage } from '@/features/auth/PasswordResetPage';
import { AcceptInvitePage } from '@/features/auth/AcceptInvitePage';

export default function App() {
  return <ThemeProvider><LanguageProvider><Routes>
    <Route path="/sign-in" element={<SignInPage />} />
    <Route path="/sign-up" element={<SignUpPage />} />
    <Route path="/forgot-password" element={<PasswordResetPage />} />
    <Route path="/invite/:token" element={<AcceptInvitePage />} />
    <Route path="*" element={<AuthenticatedApp />} />
  </Routes></LanguageProvider></ThemeProvider>;
}
