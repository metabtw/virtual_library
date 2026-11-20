import { Canvas, Rect } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, ImageBackground, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { avatarSize, drawAvatar, drawProp } from '../../public/avatar-art';
import type { Avatar, ItemId, Member, Pet } from './model';
import { supabase } from './api';
import type { Translation } from './strings';

const libraryArt = require('../../public/library.webp');
const auroraArt = require('../assets/aurora.webp');
const ring = [3, 5, 1, 7, 0, 2, 6, 8];

export function Sprite({ avatar, width }: { avatar: Avatar; width: number }) {
  const { width: sourceWidth, height: sourceHeight } = avatarSize;
  const ratio = width / sourceWidth;
  const shapes = useMemo(() => {
    const blocks: { color: string; x: number; y: number; width: number; height: number }[] = [];
    drawAvatar(avatar, (color, rectangles) => {
      rectangles.forEach(([x, y, width, height]) => blocks.push({ color, x, y, width, height }));
    });
    return blocks;
  }, [avatar]);
  return <Canvas style={{ width, height: sourceHeight * ratio }} accessible={false}>
    {shapes.map(({ color, x, y, width, height }, index) => <Rect key={index} color={color}
      x={x * ratio} y={y * ratio} width={width * ratio} height={height * ratio} />)}
  </Canvas>;
}

type PropName = Parameters<typeof drawProp>[0];
const propNames: PropName[] = ['cat', 'lamp', 'leaves', 'pot', 'catSleep', 'catUpset', 'neon', 'goldKeys', 'dragon'];
const propShapes = new Map(propNames.map(name => {
  const pixels: { color: string; x: number; y: number }[] = [];
  drawProp(name, (color, x, y) => pixels.push({ color, x, y }));
  return [name, pixels];
}));

function PropArt({ name, size }: { name: PropName; size: number }) {
  const ratio = size / 16;
  return <Canvas style={{ width: size, height: size }} accessible={false}>
    {propShapes.get(name)?.map(({ color, x, y }) => <Rect key={y * 16 + x}
      color={color} x={x * ratio} y={y * ratio} width={ratio} height={ratio} />)}
  </Canvas>;
}

function DeskProp({ item, size, distance, animate, pet }: {
  item: Exclude<ItemId, 'sweater' | 'space' | 'forest'>; size: number; distance: number; animate: boolean; pet?: Pet | null;
}) {
  const atRest = item === 'cat' && (pet?.upset || (pet?.xp ?? 0) > 0);
  const moving = animate && !atRest && item !== 'goldKeys' && item !== 'dragon';
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    motion.setValue(0);
    if (!moving) return;
    const duration = item === 'cat' ? 3200 : 1700;
    const cycle = Animated.loop(Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration, useNativeDriver: true, isInteraction: false }),
      Animated.timing(motion, { toValue: 0, duration, useNativeDriver: true, isInteraction: false }),
    ]));
    cycle.start();
    return () => cycle.stop();
  }, [moving, item, motion]);

  if (item === 'cat' && atRest) return <View style={{ position: 'absolute', left: pet?.xp && pet.xp % 2 === 0 ? '46%' : '12%', bottom: -size * .25 }}>
    <PropArt name={pet?.upset ? 'catUpset' : 'catSleep'} size={size} />
  </View>;
  if (item === 'goldKeys' || item === 'dragon') return <View style={{ position: 'absolute',
    bottom: item === 'goldKeys' ? -size * .37 : -size * .2, left: item === 'goldKeys' ? '35%' : '58%' }}>
    <PropArt name={item} size={size} />
  </View>;
  if (item === 'cat') return <Animated.View style={{ position: 'absolute', left: 2, bottom: -size * .25,
    transform: [{ translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [0, distance] }) }] }}>
    <PropArt name="cat" size={size} />
  </Animated.View>;
  if (item === 'lamp' || item === 'neon') return <View style={styles.lamp}>
    <Animated.View style={[styles.glow, { width: size + 14, height: size + 14, borderRadius: size,
      backgroundColor: item === 'neon' ? '#5ddffd' : '#ffb84d',
      opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [.16, .5] }) }]} />
    <PropArt name={item} size={size} />
  </View>;
  return <View style={styles.plant}>
    <Animated.View style={{ transform: [{ rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] }) }] }}>
      <PropArt name="leaves" size={size} />
    </Animated.View>
    <View style={StyleSheet.absoluteFill}><PropArt name="pot" size={size} /></View>
  </View>;
}

function Desk({ member, width, motion, t }: { member?: Member; width: number; motion: boolean; t: Translation }) {
  const own = member?.own === true;
  const size = Math.min(own ? 58 : 37, width * (own ? .42 : .49));
  const surfaceWidth = width * (own ? .97 : .79);
  const avatar = member?.placed.includes('sweater')
    ? { ...member.avatar, outfit: 0, color: '#d88b47' }
    : member?.avatar;
  return <View style={[styles.seat, { width }]} accessible accessibilityLabel={member ? `${member.name}, ${t[member.status]}` : t.empty}>
    <View style={[styles.seatArt, own && styles.ownArt]}>
      {member && <Text style={[styles.status, member.status === 'break' && styles.break]}>{t[member.status]}</Text>}
      {avatar && member?.status === 'desk' && <Sprite avatar={avatar} width={Math.min(own ? 99 : 51, width * (own ? .73 : .65))} />}
      <View style={[styles.desk, { width: surfaceWidth }, own && styles.ownDesk]}>
        {member?.placed.includes('neon') ? <DeskProp item="neon" size={size} distance={0} animate={motion} />
          : member?.placed.includes('lamp') && <DeskProp item="lamp" size={size} distance={0} animate={motion} />}
        {member?.placed.includes('goldKeys') && <DeskProp item="goldKeys" size={size} distance={0} animate={motion} />}
        {member?.placed.includes('dragon') && <DeskProp item="dragon" size={size * .85} distance={0} animate={motion} />}
        {member?.placed.includes('plant') && <DeskProp item="plant" size={size} distance={0} animate={motion} />}
        {member?.placed.includes('cat') && <DeskProp item="cat" pet={member.pet}
          size={size * (1 + Math.min(member.pet?.xp ?? 0, 5) * .035)}
          distance={surfaceWidth - size - 5} animate={motion} />}
      </View>
    </View>
    <Text numberOfLines={1} style={[styles.seatName, own && styles.ownName]}>
      {member ? own ? `${t.you} · ${member.name}` : member.name : t.empty}
    </Text>
    {!!member?.target && <Text numberOfLines={1} style={styles.target}>{member.target}</Text>}
  </View>;
}

export function RoomScene({ room, members, aurora, t }: { room: string | null; members: Member[]; aurora: boolean; t: Translation }) {
  const { width } = useWindowDimensions();
  const board = Math.min(width - 48, 580);
  const columnWidth = [board * .27, board * .46, board * .27];
  const [motion, setMotion] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const remote = process.env.EXPO_PUBLIC_ROOM_ART_FROM_STORAGE === 'true' && room
    ? supabase?.storage.from('room-art').getPublicUrl(`${room}.webp`).data.publicUrl
    : undefined;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (mounted) setMotion(!reduced);
    });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => setMotion(!reduced));
    return () => { mounted = false; listener.remove(); };
  }, []);
  const seats = Array<Member | undefined>(9).fill(undefined);
  seats[4] = members.find(member => member.own);
  members.filter(member => !member.own).slice(0, 8).forEach((member, i) => { seats[ring[i]] = member; });
  return <ImageBackground source={aurora ? auroraArt : remote && remote !== unavailable ? { uri: remote } : libraryArt}
    onError={() => remote && setUnavailable(remote)} style={styles.scene} imageStyle={styles.image}>
    {[0, 1, 2].map(row => <View key={row} style={styles.row}>
      {columnWidth.map((size, column) => <Desk key={column} member={seats[row * 3 + column]} width={size} motion={motion} t={t} />)}
    </View>)}
  </ImageBackground>;
}

const styles = StyleSheet.create({
  scene: { borderRadius: 20, paddingVertical: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#a96d58' },
  image: { opacity: .64, backgroundColor: '#211925' },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  seat: { alignItems: 'center', paddingHorizontal: 2, paddingVertical: 4 },
  seatArt: { minHeight: 62, justifyContent: 'flex-end', alignItems: 'center' },
  ownArt: { minHeight: 104 },
  desk: { height: 17, backgroundColor: '#a66a4a', borderTopColor: '#e9b98a', borderBottomColor: '#603837', borderTopWidth: 3, borderBottomWidth: 4, borderRadius: 3 },
  ownDesk: { height: 31, borderTopColor: '#ffd9a7', borderTopWidth: 4, borderBottomWidth: 7 },
  seatName: { color: '#ffe6d0', backgroundColor: '#251b27', fontSize: 10, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 8, maxWidth: '100%', marginTop: 2 },
  target: { color: '#e5d2af', backgroundColor: '#251b27', fontSize: 9, paddingHorizontal: 4, maxWidth: '100%', borderRadius: 5 },
  ownName: { color: '#ffd095', borderWidth: 1, borderColor: '#ffb362' },
  status: { color: '#d6f8ac', fontSize: 9, fontWeight: '700', backgroundColor: '#25252df3', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  break: { color: '#ffbe7e' },
  lamp: { position: 'absolute', left: 2, bottom: -1 },
  glow: { position: 'absolute', top: -8, left: -7, backgroundColor: '#ffb84d' },
  plant: { position: 'absolute', right: 2, bottom: -1 },
});
