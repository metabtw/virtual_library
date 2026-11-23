import { Canvas, ImageFormat, Rect, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { avatarSize, deskEquipment, drawAvatar, petAppearance, standingAvatarSize, writingSize,
  type AvatarPose, type DeskPropName, type PetItem } from '../../public/avatar-art';
import type { CoffeeCup, Member, Pet, ThemeChoice } from './model';
import { itemAssets } from './asset-art';
import { dressedAvatar, type AvatarLook } from './cosmetics';
import { resolveTheme, roomThemes } from './themes';
import { supabase } from './api';
import type { Translation } from './strings';

const ring = [3, 5, 1, 7, 0, 2, 6, 8];

export function Sprite({ avatar, width, pose = 'standing' }: { avatar: AvatarLook; width: number; pose?: AvatarPose }) {
  const { width: sourceWidth, height: sourceHeight } = pose === 'standing' ? standingAvatarSize : avatarSize;
  const ratio = width / sourceWidth;
  const shapes = useMemo(() => {
    const blocks: { color: string; x: number; y: number; width: number; height: number }[] = [];
    drawAvatar(avatar, (color, rectangles) => {
      rectangles.forEach(([x, y, width, height]) => blocks.push({ color, x, y, width, height }));
    }, pose);
    return blocks;
  }, [avatar, pose]);
  return <Canvas style={{ width, height: sourceHeight * ratio }} accessible={false}>
    {shapes.map(({ color, x, y, width, height }, index) => <Rect key={index} color={color}
      x={x * ratio} y={y * ratio} width={width * ratio} height={height * ratio} />)}
  </Canvas>;
}

export function avatarPng(avatar: AvatarLook) {
  const scale = 5;
  const surface = Skia.Surface.MakeOffscreen(standingAvatarSize.width * scale, standingAvatarSize.height * scale);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const ink = Skia.Paint();
  drawAvatar(avatar, (color, blocks) => {
    ink.setColor(Skia.Color(color));
    for (const [x, y, width, height] of blocks) {
      canvas.drawRect(Skia.XYWHRect(x * scale, y * scale, width * scale, height * scale), ink);
    }
  }, 'standing');
  surface.flush();
  return 'data:image/png;base64,' + surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG);
}

const writingFramesByTone = [
  [require('../assets/animations/writing-0.png'), require('../assets/animations/writing-1.png'),
    require('../assets/animations/writing-2.png'), require('../assets/animations/writing-3.png')],
  [require('../assets/animations/writing-1-0.png'), require('../assets/animations/writing-1-1.png'),
    require('../assets/animations/writing-1-2.png'), require('../assets/animations/writing-1-3.png')],
  [require('../assets/animations/writing-2-0.png'), require('../assets/animations/writing-2-1.png'),
    require('../assets/animations/writing-2-2.png'), require('../assets/animations/writing-2-3.png')],
  [require('../assets/animations/writing-3-0.png'), require('../assets/animations/writing-3-1.png'),
    require('../assets/animations/writing-3-2.png'), require('../assets/animations/writing-3-3.png')],
  [require('../assets/animations/writing-4-0.png'), require('../assets/animations/writing-4-1.png'),
    require('../assets/animations/writing-4-2.png'), require('../assets/animations/writing-4-3.png')],
];
const propSources = {
  ...itemAssets,
  catSleep: require('../assets/animations/catSleep.png'),
  catUpset: require('../assets/animations/catUpset.png'),
  pot: require('../assets/animations/pot.png'),
  leaves: require('../assets/animations/leaves.png'),
  jellyTankBase: require('../assets/animations/jellyTankBase.png'),
  jellyTankDrift: require('../assets/animations/jellyTankDrift.png'),
};

type PropName = keyof typeof propSources;

const lightColors = { lamp: '#ffb84d', neon: '#5de5ff', mushroomLamp: '#ff856b' };

function useAnimationClock(enabled: boolean, duration: number) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) return;
    progress.setValue(0);
    const loop = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }));
    loop.start();
    return () => loop.stop();
  }, [duration, enabled, progress]);
  return enabled ? progress : undefined;
}

function pulse(clock: Animated.Value | undefined, low: number, high: number) {
  return clock?.interpolate({ inputRange: [0, .5, 1], outputRange: [low, high, low] }) ?? low;
}

function sway(clock: Animated.Value | undefined, degrees: number) {
  return clock?.interpolate({
    inputRange: [0, .25, .75, 1],
    outputRange: ['0deg', `${degrees}deg`, `-${degrees}deg`, '0deg'],
  }) ?? '0deg';
}

function WritingHands({ width, clock, phase, tone }: { width: number; clock?: Animated.Value; phase: number; tone: number }) {
  const writingFrames = writingFramesByTone[tone] ?? writingFramesByTone[0];
  const height = width * writingSize.height / writingSize.width;
  const step = 1 / writingSize.frames;
  return <View pointerEvents="none" testID="desk-writing" style={[
    styles.writing, { width, height, top: -height * .29, marginLeft: -width / 2 },
  ]}>
    {clock ? writingFrames.map((source, frame) => {
      const start = ((frame + phase) % writingSize.frames) * step;
      const end = start + step;
      const fade = .02;
      const opacity = clock.interpolate({
        inputRange: start === 0 ? [0, end - fade, end, 1 - fade, 1] : [start - fade, start, end - fade, end],
        outputRange: start === 0 ? [1, 1, 0, 0, 1] : [0, 1, 1, 0],
        extrapolate: 'clamp',
      });
      return <Animated.Image key={frame} source={source} resizeMode="contain" fadeDuration={0}
        style={[styles.frame, { opacity }]} />;
    }) : <Image source={writingFrames[0]} resizeMode="contain" fadeDuration={0} style={styles.frame} />}
  </View>;
}

function PropArt({ name, size }: { name: PropName; size: number }) {
  return <Image source={propSources[name]} resizeMode="contain" fadeDuration={0} accessible={false}
    style={{ width: size, height: size }} />;
}

function DeskProp({ item, size, clock }: { item: DeskPropName; size: number; clock?: Animated.Value }) {
  const light = pulse(clock, .23, .88);
  const sparkle = pulse(clock, .16, 1);
  const specs = { width: size, height: size };
  const art = (name: PropName) => <PropArt name={name} size={size} />;
  switch (item) {
    case 'lamp':
    case 'neon':
    case 'mushroomLamp':
      return <View style={specs}>
        <Animated.View style={[styles.glow, { backgroundColor: lightColors[item], opacity: light }]} />
        {art(item)}
      </View>;
    case 'plant':
      return <View style={specs}>
        <Animated.View style={{ transform: [{ rotate: sway(clock, 14) }] }}>{art('leaves')}</Animated.View>
        <View style={StyleSheet.absoluteFill}>{art('pot')}</View>
      </View>;
    case 'goldKeys':
      return <View style={specs}>
        {art(item)}
        <Animated.View style={[styles.shine, {
          top: '48%', left: '16%', width: '56%', backgroundColor: '#fff0b5', opacity: sparkle,
          transform: [{ translateX: pulse(clock, 0, size * .13) }],
        }]} />
      </View>;
    case 'teaSet':
    case 'foxMug':
      return <View style={specs}>
        {art(item)}
        {clock && [0, 1].map((wisp) => <Animated.View key={wisp} style={[styles.steam, {
          height: size * .13, left: `${31 + wisp * 14}%`, top: item === 'foxMug' ? '13%' : '8%',
          opacity: clock.interpolate({ inputRange: [0, .25, .65, 1], outputRange: wisp ? [.22, .84, .18, .22] : [.72, .24, .69, .72] }),
          transform: [{ translateY: pulse(clock, 0, -size * .1) }],
        }]} />)}
      </View>;
    case 'retroRadio': {
      const led = Math.max(2, size * .095);
      return <View style={specs}>
        {art(item)}
        <Animated.View style={[styles.shine, {
          top: '55%', left: '68%', width: led, height: led, backgroundColor: '#ffd382', opacity: sparkle,
        }]} />
      </View>;
    }
    case 'hourglass':
      return <View style={specs}>
        {art(item)}
        <Animated.View style={[styles.shine, {
          top: '28%', left: '45%', width: 3, height: 3, backgroundColor: '#fff3b8', opacity: sparkle,
          transform: [{ translateY: pulse(clock, 0, size * .23) }],
        }]} />
      </View>;
    case 'miniGlobe':
    case 'origamiCrane':
      return <Animated.View style={{ transform: [{ rotate: sway(clock, 12) }] }}>{art(item)}</Animated.View>;
    case 'jellyTank':
      return <View style={[specs, { overflow: 'hidden' }]}>
        {art('jellyTankBase')}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: pulse(clock, 0, -size * .07) }] }]}>
          {art('jellyTankDrift')}
        </Animated.View>
      </View>;
    case 'crystalTerrarium':
      return <View style={specs}>
        <Animated.View style={[styles.glow, { backgroundColor: '#da75e4', opacity: light }]} />
        {art(item)}
        <Animated.View style={[styles.spark, { backgroundColor: '#fff0ff', opacity: sparkle }]} />
      </View>;
  }
}

type ThemePalette = (typeof roomThemes)[keyof typeof roomThemes]['palette'];

function PetPath({ item, progress, width, own, clock }: {
  item: PetItem; progress?: Pet | null; width: number; own: boolean; clock?: Animated.Value;
}) {
  const { art, rests } = petAppearance(item, progress);
  const size = Math.min(own ? 48 : 30, width * .8);
  const edge = Math.max(0, width - size - 6);
  const travel = clock?.interpolate({
    inputRange: [0, .44, .5, .94, 1], outputRange: [0, edge, edge, 0, 0],
  }) ?? edge;
  const direction = clock?.interpolate({ inputRange: [0, .49, .51, .99, 1], outputRange: [1, 1, -1, -1, 1] }) ?? 1;
  const hop = item === 'pinkRabbit' || item === 'yellowChick' ? -4 : -2;
  const step = clock?.interpolate({
    inputRange: [0, .125, .25, .375, .5, .625, .75, .875, 1],
    outputRange: [0, hop, 0, hop, 0, hop, 0, hop, 0],
  }) ?? 0;
  return <View pointerEvents="none" testID="pet-path" style={[styles.petPath, { width, height: size + 6 }]}>
    <Animated.View testID={`desk-pet-${item}`} style={[styles.pet, { transform: [
      { translateX: rests ? edge : travel }, { translateY: rests ? pulse(clock, 0, -.6) : step },
      { scaleX: rests ? 1 : direction }, { scale: item === 'cat' ? 1 + Math.min(progress?.xp ?? 0, 5) * .023 : 1 },
      { scaleY: rests ? pulse(clock, 1, 1.04) : 1 },
    ] }]}>
      <PropArt name={art} size={size} />
    </Animated.View>
  </View>;
}

function DeskAccessories({ member, width, own, clock, petClock, palette }: {
  member: Member; width: number; own: boolean; clock?: Animated.Value; petClock?: Animated.Value; palette: ThemePalette;
}) {
  const { props, pet } = deskEquipment(member.placed);
  const size = Math.max(1, Math.min(own ? 52 : 31, (width - 2) * .88 / props.length));
  return <>
    {props.some(Boolean) && <View pointerEvents="none" testID="desk-tray" style={[styles.accessories, {
      width, borderColor: palette.border, backgroundColor: palette.shadow,
    }]}>
      {props.map((item, index) => <View key={index} testID={item && `desk-item-${item}`} style={[styles.propCell, {
        height: Math.ceil(size) + 4, borderLeftWidth: index === 0 ? 0 : 1, borderColor: palette.border,
      }]}>{item && <DeskProp item={item} size={size} clock={clock} />}</View>)}
    </View>}
    {pet && <PetPath item={pet} progress={member.pet} width={width} own={own} clock={petClock} />}
  </>;
}

function deskDimensions(width: number, own: boolean) {
  const surface = Math.max(1, width - (own ? 4 : 10));
  const writing = Math.min(own ? 112 : 70, surface * .85);
  const avatar = Math.min(own ? 108 : 48, surface * (own ? .78 : .72));
  const tabletop = Math.max(16, writing * .32);
  return { surface, writing, avatar, tabletop };
}

function CoffeeOnDesk({ cup, now, motion }: { cup: CoffeeCup; now: number; motion: boolean }) {
  const [visible, setVisible] = useState(cup.expiresAt > now);
  const entry = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const remaining = cup.expiresAt - now;
    setVisible(remaining > 0);
    if (remaining <= 0) return;
    const expiry = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(expiry);
  }, [cup.expiresAt, now]);
  useEffect(() => {
    if (!motion) { entry.setValue(1); return; }
    const animation = Animated.timing(entry, { toValue: 1, duration: 540,
      easing: Easing.out(Easing.back(1.2)), useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [entry, motion]);
  if (!visible) return null;
  return <Animated.Image testID="desk-coffee" accessible={false} resizeMode="contain"
    source={require('../assets/animations/coffeeGift.png')}
    style={[styles.coffee, { opacity: entry.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ translateY: entry.interpolate({
      inputRange: [0, 1], outputRange: [-20, 0],
    }) }] }]} />;
}

function Desk({ member, width, peerWidth, artHeight, writingClock, itemClock, petClock, index, palette, t, onDeskPress, now, motion }: {
  member?: Member; width: number; peerWidth: number; artHeight: number; writingClock?: Animated.Value;
  itemClock?: Animated.Value; petClock?: Animated.Value;
  index: number; palette: ThemePalette; t: Translation; now: number; motion: boolean;
  onDeskPress?: (member: Member) => void;
}) {
  const own = member?.own === true;
  const dimensions = deskDimensions(own ? width : peerWidth, own);
  const avatar = member && dressedAvatar(member.avatar, member.placed);
  const activity = member?.activity ?? member?.status;
  const atDesk = activity === 'desk' || activity === 'working';
  const seated = atDesk || activity === 'missedCheck';
  const statusLabel = activity ? t[activity === 'working' ? 'studyWorking' : activity] : '';
  const description = member && [member.name, member.target, statusLabel].filter(Boolean).join(', ');
  const interactive = member?.desk_ref && !member.own && Boolean(onDeskPress);
  const Seat = interactive ? Pressable : View;
  return <Seat style={[styles.seat, { width }]} testID={own ? 'own-desk' : 'room-desk'} accessible accessibilityLabel={description || t.empty}
    accessibilityRole={interactive ? 'button' : undefined}
    onPress={interactive ? () => onDeskPress?.(member) : undefined}>
    <View style={[styles.seatArt, { minHeight: artHeight }]}>
      {activity && <Text numberOfLines={2} style={[styles.status, activity === 'break' && styles.break,
        activity !== 'break' && activity !== 'desk' && styles.working]}>{statusLabel}</Text>}
      {avatar && seated && <Sprite avatar={avatar} width={dimensions.avatar} pose="seated" />}
      <View testID="desk-surface" style={[styles.desk, {
        width: dimensions.surface, height: dimensions.tabletop,
        marginTop: seated ? -3 : 0,
        backgroundColor: palette.desk, borderBottomColor: palette.shadow,
        borderTopColor: own ? palette.accent : palette.border,
      }, own && styles.ownDesk]}>
        {member && atDesk && <WritingHands width={dimensions.writing} clock={writingClock}
          phase={index % writingSize.frames} tone={member.avatar.skin_tone ?? 0} />}
        {member?.coffeeCup && <CoffeeOnDesk key={member.coffeeCup.id} cup={member.coffeeCup} now={now} motion={motion} />}
      </View>
    </View>
    {member && <DeskAccessories member={member} width={dimensions.surface} own={own} clock={itemClock} petClock={petClock} palette={palette} />}
    <Text numberOfLines={1} style={[styles.seatName, own && styles.ownName]}>
      {member ? own ? `${t.you} · ${member.name}` : member.name : t.empty}
    </Text>
    {!!member?.target && <Text numberOfLines={1} style={styles.target}>{member.target}</Text>}
  </Seat>;
}

export const RoomScene = memo(function RoomScene({ room, members, aurora, theme, t, onDeskPress, now }: {
  room: string | null; members: Member[]; aurora: boolean; theme: ThemeChoice; t: Translation; now: number;
  onDeskPress?: (member: Member) => void;
}) {
  const { width } = useWindowDimensions();
  const [sceneWidth, setSceneWidth] = useState(0);
  const board = Math.max(1, Math.min((sceneWidth || width - 32) - 12, 580));
  const columnWidth = [board * .25, board * .50, board * .25];
  const [motion, setMotion] = useState(false);
  const [foreground, setForeground] = useState(!AppState.currentState || AppState.currentState === 'active');
  const writingClock = useAnimationClock(motion && foreground && members.some(member => member.status === 'desk'), 1040);
  const itemClock = useAnimationClock(motion && foreground && members.some(member => deskEquipment(member.placed).props.some(Boolean)), 3300);
  const petClock = useAnimationClock(motion && foreground && members.some(member => Boolean(deskEquipment(member.placed).pet)), 6000);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const selected = roomThemes[resolveTheme(theme, room, aurora)];
  const remote = theme === 'auto' && !aurora && process.env.EXPO_PUBLIC_ROOM_ART_FROM_STORAGE === 'true' && room
    ? supabase?.storage.from('room-art').getPublicUrl(`${room}.webp`).data.publicUrl
    : undefined;
  useEffect(() => {
    let awaitingMotion = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (awaitingMotion) setMotion(!reduced);
    }).catch(() => {});
    const motionListener = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      awaitingMotion = false;
      setMotion(!reduced);
    });
    const appListener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => {
      awaitingMotion = false;
      motionListener.remove();
      appListener.remove();
    };
  }, []);
  const seats = Array<Member | undefined>(9).fill(undefined);
  seats[4] = members.find(member => member.own);
  members.filter(member => !member.own).slice(0, 8).forEach((member, i) => { seats[ring[i]] = member; });
  const ownDimensions = deskDimensions(columnWidth[1], true);
  const middleHeight = seats[4] ? ownDimensions.avatar * avatarSize.height / avatarSize.width + ownDimensions.tabletop + 17 : 62;
  return <View testID="room-scene" onLayout={event => setSceneWidth(event.nativeEvent.layout.width)}
    style={[styles.scene, { borderColor: selected.palette.border }]}>
    <Image source={remote && remote !== unavailable ? { uri: remote } : selected.image} resizeMode="cover"
      onError={() => remote && setUnavailable(remote)} accessible={false} style={[styles.frame, styles.image]} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
    {[0, 1, 2].map(row => <View key={row} style={styles.row}>
      {columnWidth.map((size, column) => {
        const index = row * 3 + column;
        return <Desk key={column} member={seats[index]} width={size} peerWidth={columnWidth[0]} index={index}
          artHeight={row === 1 ? middleHeight : 62} writingClock={writingClock} itemClock={itemClock}
          petClock={petClock} palette={selected.palette} t={t} onDeskPress={onDeskPress} now={now} motion={motion && foreground} />;
      })}
    </View>)}
  </View>;
});

const styles = StyleSheet.create({
  scene: { borderRadius: 20, paddingVertical: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#a96d58' },
  image: { opacity: .9, backgroundColor: '#211925' },
  scrim: { backgroundColor: '#120f1e4a' },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  seat: { alignItems: 'center', paddingHorizontal: 2, paddingVertical: 4 },
  seatArt: { maxWidth: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  desk: { borderTopWidth: 2, borderBottomWidth: 4, borderRadius: 3 },
  coffee: { position: 'absolute', right: 2, bottom: -1, width: 29, height: 29, zIndex: 2 },
  ownDesk: { borderTopWidth: 3, borderBottomWidth: 5 },
  writing: { position: 'absolute', left: '50%' },
  frame: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  accessories: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  propCell: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  petPath: { overflow: 'hidden', backgroundColor: '#251b2750', borderRadius: 7 },
  pet: { position: 'absolute', top: 4, left: 3 },
  seatName: { color: '#ffe6d0', backgroundColor: '#251b27', fontSize: 10, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 8, maxWidth: '100%', marginTop: 2 },
  target: { color: '#e5d2af', backgroundColor: '#251b27', fontSize: 9, paddingHorizontal: 4, maxWidth: '100%', borderRadius: 5 },
  ownName: { color: '#ffd095', borderWidth: 1, borderColor: '#ffb362' },
  status: { color: '#d6f8ac', fontSize: 9, fontWeight: '700', backgroundColor: '#25252df3', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, maxWidth: '100%' },
  break: { color: '#ffbe7e' },
  working: { color: '#dacaff', backgroundColor: '#332650' },
  glow: { position: 'absolute', top: '4%', left: '6%', width: '80%', height: '78%', borderRadius: 999 },
  shine: { position: 'absolute', height: 2, borderRadius: 2 },
  spark: { position: 'absolute', left: '66%', top: '24%', width: 4, height: 4, transform: [{ rotate: '45deg' }] },
  steam: { position: 'absolute', left: '35%', top: '9%', width: 3, borderRadius: 2, backgroundColor: '#fff5d9' },
});
