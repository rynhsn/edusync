import { Route, Routes } from 'react-router-dom';
import { AuthenticatedApp } from '@/features/shell/AuthenticatedApp';
import { ActivateAdminPage } from '@/features/auth/ActivateAdminPage';
import { SignInPage } from '@/features/auth/SignInPage';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LanguageProvider } from '@/i18n';

export default function App() {
  return <ThemeProvider>
    <LanguageProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/activate/:token" element={<ActivateAdminPage />} />
        <Route path="*" element={<AuthenticatedApp />} />
      </Routes>
    </LanguageProvider>
  </ThemeProvider>;
}
