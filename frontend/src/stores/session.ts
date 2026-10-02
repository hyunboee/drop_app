import { create } from 'zustand';

export type Screen = 'login' | 'signup' | 'start' | 'denied' | 'ar';
export interface User {
  id: string;
  email: string;
}

interface SessionState {
  user: User | null;
  screen: Screen;
  setLoggedIn(user: User): void;
  setScreen(screen: Screen): void;
  logout(): void;
}

export const useSession = create<SessionState>()((set) => ({
  user: null,
  screen: 'login',
  setLoggedIn: (user) => set({ user, screen: 'start' }),
  setScreen: (screen) => set({ screen }),
  logout: () => set({ user: null, screen: 'login' }),
}));
