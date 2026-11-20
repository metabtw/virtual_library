import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import type { Room, Snapshot } from './model';
import type { Locale, Translation } from './strings';
import { Button, Field, ui } from './ui';

type DirectoryProps = {
  rooms: Room[]; current: string | null; pending: boolean; coins: number; locale: Locale;
  t: Translation; join: (room: string) => void; enter: (code: string) => void; create: (name: string) => void;
};

export function Directory({ rooms, current, pending, coins, locale, t, join, enter, create }: DirectoryProps) {
  const [search, searchFor] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const query = search.trim().toLocaleLowerCase(locale);
  const visible = rooms.filter(room =>
    [room.name, room.name_en, ...(room.targets ?? [])].some(value => value.toLocaleLowerCase(locale).includes(query)));
  return <>
    <Text style={ui.heading}>{t.choose}</Text>
    <Field label={t.searchTarget} value={search} onChangeText={searchFor} maxLength={48} />
    {!visible.length && <Text style={ui.small}>{t.noRooms}</Text>}
    {visible.map(room => <View style={ui.card} key={room.id}>
      {room.private && <Text style={ui.accent}>{t.privateRoom}</Text>}
      <View style={ui.row}>
        <Text style={ui.heading}>{locale === 'tr' ? room.name : room.name_en}</Text>
        <Text style={ui.small}>{room.count}/{room.capacity}</Text>
      </View>
      {!!room.targets?.length && <Text numberOfLines={2} style={ui.small}>{room.targets.join(' · ')}</Text>}
      <Button disabled={pending || (room.count >= room.capacity && room.id !== current)} onPress={() => join(room.id)}>
        {room.id === current ? t.open : room.count >= room.capacity ? t.roomFull : t.join}
      </Button>
      <Invite room={room} t={t} />
    </View>)}
    <View style={ui.card}>
      <Text style={ui.heading}>{t.privateRoom}</Text>
      <Field label={t.inviteCode} value={code} onChangeText={value => setCode(value.replace(/\D/g, ''))}
        maxLength={6} keyboardType="number-pad" />
      <Button muted disabled={pending || code.length !== 6} onPress={() => enter(code)}>{t.joinCode}</Button>
      <Field label={t.roomName} value={name} onChangeText={setName} maxLength={32} />
      <Button disabled={pending || coins < 10 || name.trim().length < 2} onPress={() => create(name.trim())}>{t.createRoom}</Button>
    </View>
  </>;
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
  const [value, setValue] = useState(initial);
  return <View style={ui.card}>
    <Field label={t.target} placeholder={t.targetHint} value={value} onChangeText={setValue} maxLength={48} />
    <Button muted disabled={pending || value.trim() === initial} onPress={() => save(value.trim())}>{t.save}</Button>
  </View>;
}

export function RoomGoal({ minutes, t }: { minutes: number; t: Translation }) {
  const target = (Math.floor(minutes / 500) + 1) * 500;
  return <View style={ui.card}>
    <View style={ui.row}>
      <Text style={ui.heading}>🌳 {t.commonGoal}</Text>
      <Text style={ui.accent}>{minutes} / {target} min</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={t.groupMinutes}
      accessibilityValue={{ min: 0, max: 500, now: minutes % 500 }}
      style={{ height: 8, borderRadius: 8, backgroundColor: '#231925', overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${(minutes % 500) / 5}%`, backgroundColor: '#a3c48f' }} />
    </View>
    {minutes >= 500 && <Text style={ui.small}>{t.goalReached}</Text>}
  </View>;
}

export function Boxes({ snapshot, pending, t, open }: {
  snapshot: Snapshot; pending: boolean; t: Translation; open: (kind: 'openBox' | 'openChest') => void;
}) {
  const chests = snapshot.chests ?? 0;
  const rare = snapshot.items.filter(item => item.kind === 'rare');
  const complete = rare.length > 0 && rare.every(item => snapshot.inventory.some(owned => owned.item === item.id));
  return <View style={ui.card}>
    <Text style={ui.heading}>🎁 {t.box}</Text>
    <Text style={ui.small}>{complete ? t.collectionComplete : t.boxRules}</Text>
    <Button disabled={pending || complete || (snapshot.profile?.coins ?? 0) < 50} onPress={() => open('openBox')}>
      {t.openBox}
    </Button>
    <View style={ui.row}><Text style={ui.heading}>{t.chest}</Text><Text style={ui.accent}>{chests}</Text></View>
    <Button muted disabled={pending || !chests} onPress={() => open('openChest')}>{t.openChest}</Button>
  </View>;
}
