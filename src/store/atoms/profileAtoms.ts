import { atom } from 'jotai';
import { defaultProfileAppearance, ProfileAppearance } from '../types/profile';

export const profileAppearanceAtom = atom<ProfileAppearance>(
  defaultProfileAppearance,
);
