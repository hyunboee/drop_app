import { create } from 'zustand';

export type PermissionName = 'camera' | 'location' | 'orientation';
export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

interface ArState {
  denied: PermissionName[];
  position: GeoPosition | null;
  heading: number | null;
  setDenied(denied: PermissionName[]): void;
  setPosition(p: GeoPosition): void;
  setHeading(h: number | null): void;
}

export const useArStore = create<ArState>()((set) => ({
  denied: [],
  position: null,
  heading: null,
  setDenied: (denied) => set({ denied }),
  setPosition: (position) => set({ position }),
  setHeading: (heading) => set({ heading }),
}));
