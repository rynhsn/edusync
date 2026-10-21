export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
}

export type SessionState = 'loading' | 'signed-out' | 'signed-in';

export type PageKey = 'dashboard' | 'students' | 'classes' | 'academic-years';
