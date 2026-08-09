import React from 'react';
import {
  Image,
  ImageBackground,
  ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { SERIF_FONT } from '../theme/fonts';
import {
  PROFILE_AVATARS,
  PROFILE_CARD_BACKGROUND,
  PROFILE_FRAMES,
  ProfileAsset,
} from '../theme/profileAssets';
import {
  ProfileAvatarId,
  ProfileFrameId,
  useProfileAppearance,
  useReadingStats,
  useSetProfileAvatar,
  useSetProfileFrame,
} from '../store';
import { resolveReaderLevel } from '../utils/readerLevel';
import { Icon } from './Icon';
import { Text } from './Text';

type CustomizerTab = 'avatar' | 'frame';

interface ProfileIdentityCardProps {
  bookshelfCount: number;
  finishedCount: number;
  immersive?: boolean;
  streak: number;
}

const CARD_TEXT = '#F2EEE5';
const CARD_MUTED = 'rgba(242,238,229,.66)';
const CARD_GOLD = '#D5B36A';
const CARD_JADE = '#6FC2AE';

export function ProfileIdentityCard({
  bookshelfCount,
  finishedCount,
  immersive = false,
  streak,
}: ProfileIdentityCardProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const stats = useReadingStats();
  const appearance = useProfileAppearance();
  const setAvatar = useSetProfileAvatar();
  const setFrame = useSetProfileFrame();
  const [customizer, setCustomizer] = React.useState<CustomizerTab | null>(
    null,
  );
  const level = resolveReaderLevel(stats.totalMinutes);
  const immersiveTopInset = immersive ? insets.top : 0;

  const avatar =
    PROFILE_AVATARS.find(item => item.id === appearance.avatarId) ??
    PROFILE_AVATARS[0];
  const frame =
    PROFILE_FRAMES.find(item => item.id === appearance.frameId) ??
    PROFILE_FRAMES[0];
  const progressLabel = level.next
    ? `${stats.totalMinutes} / ${level.next.thresholdMinutes} 阅历`
    : `${stats.totalMinutes} 阅历 · 已满级`;

  return (
    <>
      <View
        style={[
          styles.card,
          immersive && styles.immersiveCard,
          theme.shadows.md,
        ]}
      >
        <ImageBackground
          source={PROFILE_CARD_BACKGROUND}
          resizeMode="cover"
          imageStyle={[
            styles.cardBackgroundImage,
            immersive && styles.immersiveCardBackgroundImage,
          ]}
          style={[
            styles.cardBackground,
            immersive && { minHeight: 282 + immersiveTopInset },
          ]}
        >
          <View
            style={[
              styles.identityRow,
              immersive && {
                minHeight: 220 + immersiveTopInset,
                paddingTop: 16 + immersiveTopInset,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`当前头像：${avatar.name}，点击更换头像`}
              onPress={() => setCustomizer('avatar')}
              style={({ pressed }) => [
                styles.avatarButton,
                pressed && styles.pressed,
              ]}
            >
              <Image source={avatar.source} style={styles.avatarImage} />
              <Image
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                source={frame.source}
                style={styles.avatarFrame}
              />
              <View style={styles.editBadge}>
                <Icon name="edit" size={13} color="#173B34" />
              </View>
            </Pressable>

            <View style={styles.identityInfo}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="打开头像和边框装扮"
                onPress={() => setCustomizer('avatar')}
                style={styles.nameRow}
              >
                <Text style={styles.profileName}>书友</Text>
                <Icon name="chevron-right" size={20} color={CARD_MUTED} />
              </Pressable>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>
                  Lv.{level.current.level} {level.current.title}
                </Text>
              </View>
              <View style={styles.progressHeader}>
                <Text style={styles.experienceText}>{progressLabel}</Text>
                {level.next ? (
                  <Text style={styles.remainingText}>
                    还差 {level.remainingMinutes} 分钟
                  </Text>
                ) : null}
              </View>
              <View style={styles.progressTrack}>
                <View
                  accessibilityLabel={`等级进度 ${Math.round(
                    level.progress * 100,
                  )}%`}
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(level.progress * 100)}%` },
                  ]}
                />
              </View>
              <View style={styles.customizeActions}>
                <CustomizerButton
                  icon="person-outline"
                  label="换头像"
                  onPress={() => setCustomizer('avatar')}
                />
                <CustomizerButton
                  icon="filter-frames"
                  label="换边框"
                  onPress={() => setCustomizer('frame')}
                />
              </View>
            </View>
          </View>

          <View style={styles.identityStats}>
            <IdentityStat value={bookshelfCount} label="书架" />
            <IdentityStat value={finishedCount} label="已读完" />
            <IdentityStat value={streak} label="连续天数" accent />
          </View>
        </ImageBackground>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setCustomizer(null)}
        transparent
        visible={customizer !== null}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="关闭装扮面板"
            onPress={() => setCustomizer(null)}
            style={styles.modalBackdrop}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                paddingBottom: Math.max(18, insets.bottom + 8),
              },
              theme.shadows.lg,
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>
                  装扮
                </Text>
                <Text
                  style={[
                    styles.sheetSubtitle,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  点击立即生效 · 阅读升级解锁更多样式
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭"
                hitSlop={10}
                onPress={() => setCustomizer(null)}
                style={styles.closeButton}
              >
                <Icon
                  name="close"
                  size={21}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
            </View>

            <View
              style={[
                styles.tabs,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <SheetTab
                active={customizer === 'avatar'}
                label="头像"
                onPress={() => setCustomizer('avatar')}
              />
              <SheetTab
                active={customizer === 'frame'}
                label="边框"
                onPress={() => setCustomizer('frame')}
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.assetGrid}
              showsVerticalScrollIndicator={false}
            >
              {customizer === 'frame'
                ? PROFILE_FRAMES.map(item => (
                    <FrameOption
                      key={item.id}
                      asset={item}
                      avatarSource={avatar.source}
                      currentLevel={level.current.level}
                      selected={item.id === appearance.frameId}
                      onPress={() => setFrame(item.id)}
                    />
                  ))
                : PROFILE_AVATARS.map(item => (
                    <AvatarOption
                      key={item.id}
                      asset={item}
                      currentFrameSource={frame.source}
                      currentLevel={level.current.level}
                      selected={item.id === appearance.avatarId}
                      onPress={() => setAvatar(item.id)}
                    />
                  ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CustomizerButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.customizeButton,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={15} color={CARD_TEXT} />
      <Text style={styles.customizeButtonText}>{label}</Text>
    </Pressable>
  );
}

function IdentityStat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.identityStat}>
      <Text
        style={[styles.identityStatValue, accent && styles.identityStatAccent]}
      >
        {value}
      </Text>
      <Text style={styles.identityStatLabel}>{label}</Text>
    </View>
  );
}

function SheetTab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AvatarOption({
  asset,
  currentFrameSource,
  currentLevel,
  selected,
  onPress,
}: {
  asset: ProfileAsset<ProfileAvatarId>;
  currentFrameSource: ImageSourcePropType;
  currentLevel: number;
  selected: boolean;
  onPress: () => void;
}) {
  const locked = currentLevel < asset.unlockLevel;
  return (
    <AssetOption
      locked={locked}
      name={asset.name}
      selected={selected}
      unlockLevel={asset.unlockLevel}
      onPress={onPress}
    >
      <Image source={asset.source} style={styles.optionAvatar} />
      <Image source={currentFrameSource} style={styles.optionFrame} />
    </AssetOption>
  );
}

function FrameOption({
  asset,
  avatarSource,
  currentLevel,
  selected,
  onPress,
}: {
  asset: ProfileAsset<ProfileFrameId>;
  avatarSource: ImageSourcePropType;
  currentLevel: number;
  selected: boolean;
  onPress: () => void;
}) {
  const locked = currentLevel < asset.unlockLevel;
  return (
    <AssetOption
      locked={locked}
      name={asset.name}
      selected={selected}
      unlockLevel={asset.unlockLevel}
      onPress={onPress}
    >
      <Image source={avatarSource} style={styles.optionAvatar} />
      <Image source={asset.source} style={styles.optionFrame} />
    </AssetOption>
  );
}

function AssetOption({
  children,
  locked,
  name,
  selected,
  unlockLevel,
  onPress,
}: {
  children: React.ReactNode;
  locked: boolean;
  name: string;
  selected: boolean;
  unlockLevel: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityLabel={locked ? `${name}，Lv.${unlockLevel} 解锁` : name}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked, selected }}
      disabled={locked}
      onPress={onPress}
      style={styles.assetOption}
    >
      <View
        style={[
          styles.assetPreview,
          {
            backgroundColor: theme.colors.background,
            borderColor: selected ? theme.colors.gold : theme.colors.border,
          },
        ]}
      >
        {children}
        {locked ? (
          <View style={styles.lockedOverlay}>
            <Icon name="lock" size={18} color="#F2EEE5" />
            <Text style={styles.lockedText}>Lv.{unlockLevel}</Text>
          </View>
        ) : null}
        {selected ? (
          <View style={styles.selectedBadge}>
            <Icon name="check" size={13} color="#15352F" />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.assetName, { color: theme.colors.textSecondary }]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
  },
  immersiveCard: {
    borderRadius: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    marginHorizontal: 0,
    marginTop: 0,
  },
  cardBackground: { minHeight: 282 },
  cardBackgroundImage: { borderRadius: 12 },
  immersiveCardBackgroundImage: {
    borderRadius: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 220,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 13,
  },
  avatarButton: {
    alignItems: 'center',
    height: 144,
    justifyContent: 'center',
    width: 144,
  },
  avatarImage: {
    borderRadius: 20,
    height: 106,
    width: 106,
  },
  avatarFrame: {
    height: 138,
    position: 'absolute',
    width: 138,
  },
  editBadge: {
    alignItems: 'center',
    backgroundColor: CARD_GOLD,
    borderColor: '#193A34',
    borderRadius: 12,
    borderWidth: 2,
    bottom: 3,
    height: 25,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: 25,
  },
  identityInfo: { flex: 1, marginLeft: 7 },
  nameRow: { alignItems: 'center', flexDirection: 'row', minHeight: 30 },
  profileName: {
    color: CARD_TEXT,
    fontFamily: SERIF_FONT,
    fontSize: 24,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  levelBadge: {
    alignSelf: 'flex-start',
    borderColor: 'rgba(213,179,106,.62)',
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelBadgeText: { color: '#DCC484', fontSize: 11.5, fontWeight: '600' },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  experienceText: { color: CARD_TEXT, fontSize: 11.5, fontWeight: '500' },
  remainingText: { color: CARD_MUTED, fontSize: 9.5 },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,.13)',
    borderRadius: 3,
    height: 5,
    marginTop: 5,
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: CARD_JADE, borderRadius: 3, height: 5 },
  customizeActions: { flexDirection: 'row', gap: 7, marginTop: 9 },
  customizeButton: {
    alignItems: 'center',
    borderColor: 'rgba(242,238,229,.28)',
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 29,
    paddingHorizontal: 8,
  },
  customizeButtonText: { color: CARD_TEXT, fontSize: 10.5, marginLeft: 4 },
  pressed: { opacity: 0.7 },
  identityStats: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,29,27,.58)',
    borderColor: 'rgba(213,179,106,.26)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 60,
    marginBottom: 14,
    marginHorizontal: 14,
  },
  identityStat: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  identityStatValue: {
    color: CARD_TEXT,
    fontFamily: SERIF_FONT,
    fontSize: 18,
    fontWeight: '600',
  },
  identityStatAccent: { color: CARD_JADE },
  identityStatLabel: { color: CARD_MUTED, fontSize: 10, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,.56)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    paddingHorizontal: 18,
    paddingTop: 9,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(128,128,128,.42)',
    borderRadius: 2,
    height: 4,
    width: 38,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  sheetTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 21,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  sheetSubtitle: { fontSize: 11, marginTop: 4 },
  closeButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  tabs: { borderRadius: 9, flexDirection: 'row', marginTop: 16, padding: 3 },
  tab: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#315F55' },
  tabText: { color: '#7F8783', fontSize: 13 },
  tabTextActive: { color: '#F2EEE5', fontWeight: '600' },
  assetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 8,
    paddingTop: 16,
  },
  assetOption: { alignItems: 'center', marginBottom: 16, width: '33.333%' },
  assetPreview: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 92,
  },
  optionAvatar: {
    borderRadius: 16,
    height: 68,
    position: 'absolute',
    width: 68,
  },
  optionFrame: { height: 84, position: 'absolute', width: 84 },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(6,10,10,.64)',
    justifyContent: 'center',
  },
  lockedText: { color: '#F2EEE5', fontSize: 10, marginTop: 2 },
  selectedBadge: {
    alignItems: 'center',
    backgroundColor: CARD_JADE,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
  },
  assetName: {
    fontSize: 10.5,
    marginTop: 6,
    maxWidth: 94,
    textAlign: 'center',
  },
});
