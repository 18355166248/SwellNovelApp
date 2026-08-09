import { ImageSourcePropType } from 'react-native';
import { ProfileAvatarId, ProfileFrameId } from '../store/types/profile';

export interface ProfileAsset<T extends string> {
  id: T;
  name: string;
  unlockLevel: number;
  source: ImageSourcePropType;
}

export const PROFILE_CARD_BACKGROUND = require('../assets/profile/profile-card-background.png');

export const PROFILE_AVATARS: ProfileAsset<ProfileAvatarId>[] = [
  {
    id: 'scholar',
    name: '竹简公子',
    unlockLevel: 1,
    source: require('../assets/profile/avatars/avatar-01.png'),
  },
  {
    id: 'reader',
    name: '清筠书友',
    unlockLevel: 1,
    source: require('../assets/profile/avatars/avatar-02.png'),
  },
  {
    id: 'moon',
    name: '山河望月',
    unlockLevel: 2,
    source: require('../assets/profile/avatars/avatar-03.png'),
  },
  {
    id: 'crane',
    name: '松间白鹤',
    unlockLevel: 3,
    source: require('../assets/profile/avatars/avatar-04.png'),
  },
  {
    id: 'bamboo-book',
    name: '竹影书卷',
    unlockLevel: 5,
    source: require('../assets/profile/avatars/avatar-05.png'),
  },
  {
    id: 'plum-lantern',
    name: '梅下灯影',
    unlockLevel: 7,
    source: require('../assets/profile/avatars/avatar-06.png'),
  },
];

export const PROFILE_FRAMES: ProfileAsset<ProfileFrameId>[] = [
  {
    id: 'ink-jade',
    name: '墨玉初章',
    unlockLevel: 1,
    source: require('../assets/profile/frames/frame-01.png'),
  },
  {
    id: 'bamboo-jade',
    name: '竹节清辉',
    unlockLevel: 2,
    source: require('../assets/profile/frames/frame-02.png'),
  },
  {
    id: 'bookplate',
    name: '藏书金叶',
    unlockLevel: 3,
    source: require('../assets/profile/frames/frame-03.png'),
  },
  {
    id: 'silver-crane',
    name: '鹤羽流银',
    unlockLevel: 5,
    source: require('../assets/profile/frames/frame-04.png'),
  },
  {
    id: 'gold-cloud',
    name: '云纹垂玉',
    unlockLevel: 7,
    source: require('../assets/profile/frames/frame-05.png'),
  },
  {
    id: 'plum-glory',
    name: '梅华照夜',
    unlockLevel: 9,
    source: require('../assets/profile/frames/frame-06.png'),
  },
];
