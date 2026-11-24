import { useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { defaultRoomTheme } from '../../public/room-art';
import { roomGoalMinutes, roomThemeUnlockMinutes } from '../../public/study-rewards';
import type { Room } from './model';
import type { Locale, Translation } from './strings';
import { roomThemes } from './themes';
import { Button, Disclosure, Field, ui } from './ui';

type DirectoryProps = {
  rooms: Room[]; current: string | null; pending: boolean; ownsPrivateRoom: boolean; coins: number; locale: Locale;
  t: Translation; join: (room: string) => void; enter: (code: string) => void; create: (name: string) => void;
};

export function Directory({ rooms, current, pending, ownsPrivateRoom, coins, locale, t, join, enter, create }: DirectoryProps) {
  const [search, searchFor] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const { fontScale } = useWindowDimensions();
  const query = search.trim().toLocaleLowerCase(locale);
  const visible = rooms.filter(room =>
    [room.name, room.name_en, ...(room.targets ?? [])].some(value => value.toLocaleLowerCase(locale).includes(query)));
  return <>
    <TextInput accessibilityLabel={t.searchTarget} placeholder={t.searchTarget} placeholderTextColor="#b9a2b7"
      style={ui.input} value={search} onChangeText={searchFor} maxLength={48} />
    <View style={ui.card}>
      <Disclosure title={t.openPrivateRoom}>
        {ownsPrivateRoom ? <Text style={ui.small}>{t.privateRoomOwned}</Text> : <>
          <Field label={t.roomName} value={name} onChangeText={setName} maxLength={32} />
          <Button disabled={pending || coins < 10 || name.trim().length < 2} onPress={() => create(name.trim())}>{t.createRoom}</Button>
        </>}
      </Disclosure>
      <Disclosure title={t.joinCode}>
        <Field label={t.inviteCode} value={code} onChangeText={value => setCode(value.replace(/\D/g, ''))}
          maxLength={6} keyboardType="number-pad" />
        <Button muted disabled={pending || code.length !== 6} onPress={() => enter(code)}>{t.joinCode}</Button>
      </Disclosure>
    </View>
    {!visible.length && <Text style={ui.small}>{t.noRooms}</Text>}
    <View style={styles.roomGrid}>{visible.map(room => <View style={[ui.card, styles.roomCard, fontScale >= 1.55 && styles.full]} key={room.id}>
      <Image source={roomThemes[defaultRoomTheme(room.id, (room.minutes ?? 0) >= roomThemeUnlockMinutes)].image}
        accessibilityIgnoresInvertColors accessible={false} resizeMode="cover" style={styles.preview} />
      <View style={styles.roomTitle}>
        <Text numberOfLines={2} style={styles.name}>{locale === 'tr' ? room.name : room.name_en}</Text>
        {room.private && <PrivateBadge t={t} />}
      </View><Text style={ui.small}>{room.count}/{room.capacity}</Text>
      {!!room.targets?.length && <Text numberOfLines={2} style={ui.small}>{room.targets.join(' · ')}</Text>}
      <View style={styles.open}><Button disabled={pending || (room.count >= room.capacity && room.id !== current)} onPress={() => join(room.id)}>
        {room.id === current ? t.open : room.count >= room.capacity ? t.roomFull : t.join}
      </Button></View>
    </View>)}</View>
  </>;
}

export function PrivateBadge({ t }: { t: Translation }) {
  return <Text style={styles.private}>{t.privateBadge}</Text>;
}

export function Invite({ room, t }: { room: Room; t: Translation }) {
  if (!room.invite) return null;
  const invite = room.invite;
  return <>
    <Text selectable style={ui.small}>{t.inviteCode} · {invite}</Text>
    <Button muted onPress={() => void Share.share({ message: `${room.name} · ${t.inviteCode}: ${invite}` }).catch(() => {})}>
      {t.shareInvite}
    </Button>
  </>;
}

export function TargetEditor({ initial, save, pending, t }: {
  initial: string; save: (target: string) => void; pending: boolean; t: Translation;
}) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(initial);
  return <View style={ui.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={t.studyTarget} accessibilityState={{ expanded }}
      style={[ui.row, styles.targetToggle]} onPress={() => setExpanded(open => !open)}>
      <Text style={ui.heading}>{t.studyTarget}</Text>
      <Text accessible={false} style={ui.accent}>{expanded ? '▴' : '▾'}</Text>
    </Pressable>
    {expanded && <>
      <Field label={t.target} placeholder={t.targetHint} value={value} onChangeText={setValue} maxLength={48} />
      <Button muted disabled={pending || value.trim() === initial} onPress={() => save(value.trim())}>{t.save}</Button>
    </>}
  </View>;
}

export function RoomGoal({ progress, t }: { progress: number; t: Translation }) {
  return <View><View style={styles.goal}>
    <Text style={styles.goalText}>🎁 {t.chestGoal}</Text>
    <View accessibilityRole="progressbar" accessibilityLabel={t.groupMinutes}
      accessibilityValue={{ min: 0, max: roomGoalMinutes, now: progress }} style={styles.progress}>
      <View style={{ height: '100%', width: `${progress / roomGoalMinutes * 100}%`, backgroundColor: '#efad71' }} />
    </View>
    <Text style={ui.accent}>{progress}/{roomGoalMinutes}</Text>
  </View><Text style={[ui.small, { marginTop: 5 }]}>{t.chestGoalInfo}</Text></View>;
}

const styles = StyleSheet.create({
  targetToggle: { minHeight: 44 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomCard: { width: '48.5%', gap: 6, padding: 9, minWidth: 0 },
  preview: { width: '100%', height: 62, borderRadius: 8, backgroundColor: '#31233a' },
  full: { width: '100%' },
  roomTitle: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  name: { color: '#fff0dc', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  private: { color: '#ffd2a0', fontSize: 11, fontWeight: '700', backgroundColor: '#573942',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  open: { marginTop: 'auto' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 7,
    borderWidth: 1, borderColor: '#ad80645e', borderRadius: 10, backgroundColor: '#30222e' },
  goalText: { color: '#ffe2be', fontWeight: '700', fontSize: 12, flexShrink: 1 },
  progress: { flex: 1, minWidth: 14, height: 6, borderRadius: 8, backgroundColor: '#533741', overflow: 'hidden' },
});
