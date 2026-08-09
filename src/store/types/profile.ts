/** “我的”页本地身份装扮；只保存选择结果，等级由真实阅读时长派生。 */
export const PROFILE_AVATAR_IDS = [
  'scholar',
  'reader',
  'moon',
  'crane',
  'bamboo-book',
  'plum-lantern',
] as const;

export const PROFILE_FRAME_IDS = [
  'ink-jade',
  'bamboo-jade',
  'bookplate',
  'silver-crane',
  'gold-cloud',
  'plum-glory',
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATAR_IDS)[number];
export type ProfileFrameId = (typeof PROFILE_FRAME_IDS)[number];

export interface ProfileAppearance {
  avatarId: ProfileAvatarId;
  frameId: ProfileFrameId;
}

export const defaultProfileAppearance: ProfileAppearance = {
  avatarId: 'scholar',
  frameId: 'ink-jade',
};

export const normalizeProfileAppearance = (
  value?: Partial<ProfileAppearance>,
): ProfileAppearance => ({
  avatarId: PROFILE_AVATAR_IDS.includes(value?.avatarId as ProfileAvatarId)
    ? (value?.avatarId as ProfileAvatarId)
    : defaultProfileAppearance.avatarId,
  frameId: PROFILE_FRAME_IDS.includes(value?.frameId as ProfileFrameId)
    ? (value?.frameId as ProfileFrameId)
    : defaultProfileAppearance.frameId,
});
