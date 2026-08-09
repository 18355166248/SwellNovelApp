import { useAtomValue, useSetAtom } from 'jotai';
import { profileAppearanceAtom } from '../atoms';
import { ProfileAvatarId, ProfileFrameId } from '../types/profile';

export const useProfileAppearance = () => useAtomValue(profileAppearanceAtom);

export const useSetProfileAvatar = () => {
  const setAppearance = useSetAtom(profileAppearanceAtom);
  return (avatarId: ProfileAvatarId) =>
    setAppearance(previous => ({ ...previous, avatarId }));
};

export const useSetProfileFrame = () => {
  const setAppearance = useSetAtom(profileAppearanceAtom);
  return (frameId: ProfileFrameId) =>
    setAppearance(previous => ({ ...previous, frameId }));
};
