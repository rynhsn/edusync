import { Route, Routes } from 'react-router-dom';
import { AuthenticatedApp } from '@/features/shell/AuthenticatedApp';
import { SignInPage } from '@/features/auth/SignInPage';

export default function App() {
  return <Routes>
    <Route path="/sign-in" element={<SignInPage />} />
    <Route path="*" element={<AuthenticatedApp />} />
  </Routes>;
}
