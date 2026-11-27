import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { localMeetInput, meetDate, meetPhase, meetTimestamp, shareMeetText,
  type Meet, type PairGoal, type Together } from '../../public/study-together';
import { meetPreview, studyTogether } from './api';
import { message, type Locale, type Translation } from './strings';
import { Button, Disclosure, Field, Options, ui } from './ui';

export function MeetPreview({ id, locale, t }: { id: string; locale: Locale; t: Translation }) {
  const query = useQuery({ queryKey: ['meet-preview', id], queryFn: () => meetPreview(id), retry: false });
  return <View style={ui.card}>
    <Text accessibilityRole="header" style={ui.heading}>{t.meetTitle}</Text>
    {query.data ? <><MeetInfo meet={query.data} locale={locale} t={t} /><Text style={ui.small}>{t.meetSignIn}</Text></>
      : <Text accessibilityLiveRegion="polite" style={ui.small}>{query.isError ? message(t, query.error) : t.loading}</Text>}
  </View>;
}

function MeetInfo({ meet, locale, t }: { meet: Meet; locale: Locale; t: Translation }) {
  return <>
    <Text style={ui.heading}>{meet.topic}</Text>
    <Text style={ui.small}>{meetDate(meet.startsAt, locale)} · {meet.minutes} {t.minuteUnit}</Text>
    <Text style={ui.small}>{locale === 'tr' ? meet.room : meet.roomEn} · {t.meetBy} {meet.host}</Text>
  </>;
}

export function TogetherSheet({ user, locale, t, initial, close, join, changed, pairCard }: {
  user: string; locale: Locale; t: Translation; initial?: string;
  close: () => void; join: (meet: Meet) => Promise<void>; changed: (remind: boolean) => void; pairCard: (goal: PairGoal) => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [topic, setTopic] = useState('');
  const [initialDate, initialTime] = localMeetInput(new Date(Date.now() + 3600000)).split('T');
  const [day, setDay] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [minutes, setMinutes] = useState('25');
  const [room, setRoom] = useState<string>();
  const [friend, setFriend] = useState<string>();
  const [target, setTarget] = useState('3');
  const [avatar, setAvatar] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const list = useQuery({ queryKey: ['studyTogether', user], queryFn: () => studyTogether<Together>(), retry: false, staleTime: 0, refetchInterval: 15000 });
  const appointment = useQuery({ queryKey: ['studyMeet', user, selected], enabled: !!selected, retry: false, staleTime: 0,
    queryFn: () => studyTogether<Meet>({ op: 'meet', id: selected }) });

  async function run(work: () => Promise<unknown>) {
    if (working) return;
    setWorking(true);
    setError('');
    try { await work(); } catch (failure) { setError(message(t, failure)); }
    finally { setWorking(false); }
  }

  async function create() {
    const meet = await studyTogether<Meet>({ op: 'createMeet', topic: topic.trim(), startsAt: meetTimestamp(day, time),
      minutes: Number(minutes), room: room ?? list.data?.rooms[0]?.id });
    setTopic('');
    setSelected(meet.id);
    void list.refetch();
  }

  function modify(op: string, key: string, options: object = {}) {
    void run(async () => {
      await studyTogether({ op, id: key, ...options });
      if (['cancelMeet','rsvp','leaveMeet'].includes(op)) changed(op === 'rsvp' && 'remind' in options && options.remind === true);
      if (op === 'cancelMeet') setSelected(undefined);
      else if (selected) void appointment.refetch();
      await list.refetch();
    });
  }

  function confirm(title: string, question: string, action: () => void) {
    Alert.alert(title, question, [{ text: t.cancel, style: 'cancel' }, { text: title, style: 'destructive', onPress: action }]);
  }

  function meeting(meet: Meet) {
    const phase = meetPhase(meet, now);
    return <View key={meet.id} style={ui.card}><MeetInfo meet={meet} locale={locale} t={t} />
      {phase === 'ended' ? <Text style={ui.small}>{t.meetEnded}</Text> : <>
        {!meet.joined && <Button disabled={working} onPress={() => modify('rsvp', meet.id)}>{t.meetRSVP}</Button>}
        {meet.joined && phase === 'open' && <Button disabled={working} onPress={() => void run(() => join(meet))}>{t.meetJoin}</Button>}
        {meet.joined && phase === 'upcoming' && <>
          <Text style={ui.small}>{meet.remind ? t.meetReminderOn : t.meetTooEarly}</Text>
          <Button muted disabled={working} onPress={() => modify('rsvp', meet.id, { remind: !meet.remind })}>
            {meet.remind ? t.meetRemindOff : t.meetRemind}
          </Button>
        </>}
        <Button muted disabled={working} onPress={() => void run(() => Share.share({ message: shareMeetText(meet, locale) }))}>{t.meetShare}</Button>
        {meet.joined && <Button muted disabled={working} onPress={() => meet.owner
          ? confirm(t.meetCancel, t.meetCancelConfirm, () => modify('cancelMeet', meet.id)) : modify('leaveMeet', meet.id)}>
          {meet.owner ? t.meetCancel : t.meetLeave}
        </Button>}
      </>}
    </View>;
  }

  function goal(entry: PairGoal) {
    const ready = entry.progress === entry.target;
    return <View key={entry.id} style={ui.card}>
      <Text style={ui.heading}>{entry.friend}</Text><Text style={ui.small}>{entry.week}</Text>
      <Text style={ui.accent}>{entry.invite ? entry.own ? t.pairAsked : t.pairIncoming : `${entry.progress} / ${entry.target} · ${t.pairTarget}`}</Text>
      {entry.invite && !entry.own && <Button disabled={working} onPress={() => modify('acceptGoal',entry.id,{ avatar: entry.avatarAllowed })}>
        {t.pairAccept}
      </Button>}
      <View style={styles.privacy}><Text style={[ui.small, { flex:1 }]}>{t.pairAvatar}</Text>
        <Switch accessibilityLabel={t.pairAvatar} value={entry.avatarAllowed} disabled={working}
          onValueChange={value => modify('shareGoalAvatar',entry.id,{ avatar:value })} /></View>
      {ready && (entry.partnerAvatar ? <Button onPress={() => pairCard(entry)}>{t.pairShare}</Button>
        : <Text style={ui.small}>{t.pairOtherAvatar}</Text>)}
      <Button muted disabled={working} onPress={() => confirm(t.pairLeave,t.pairLeaveConfirm,() => modify('leaveGoal',entry.id))}>{t.pairLeave}</Button>
    </View>;
  }

  const details = selected ? appointment : list;
  const friends = list.data?.friends ?? [];
  return <Modal transparent onRequestClose={close} accessibilityViewIsModal>
    <View style={ui.modal}><View style={[ui.card, styles.sheet]}>
      <Text accessibilityRole="header" style={ui.heading}>{selected ? t.meetTitle : t.together}</Text>
      {error !== '' && <Text accessibilityLiveRegion="polite" style={ui.warning}>{error}</Text>}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {details.isPending ? <Text style={ui.small}>{t.loading}</Text>
          : details.isError ? <><Text style={ui.warning}>{message(t, details.error)}</Text>
            <Button muted onPress={() => void details.refetch()}>{t.retry}</Button></>
          : selected && appointment.data ? meeting(appointment.data) : list.data && <>
            <Text accessibilityRole="header" style={ui.heading}>{t.meetings}</Text>
            <View style={ui.card}><Disclosure title={t.meetCreate}>
              <Field label={t.meetTopic} value={topic} onChangeText={setTopic} maxLength={80} />
              <Field label={t.meetDay} value={day} onChangeText={setDay} maxLength={10} />
              <Field label={t.meetTime} value={time} onChangeText={setTime} maxLength={5} />
              <Field label={t.minuteUnit} keyboardType="number-pad" value={minutes} onChangeText={setMinutes} maxLength={3} />
              <View style={styles.roomPicker}><Options label={t.meetRoom} values={list.data.rooms.map(entry =>
                [entry.id,locale === 'tr' ? entry.name : entry.nameEn])} value={room ?? list.data.rooms[0]?.id} onChange={setRoom} /></View>
              <Button disabled={working || topic.trim().length < 2} onPress={() => void run(create)}>{t.meetCreate}</Button>
            </Disclosure></View>
            {list.data.meets.length ? list.data.meets.map(meeting) : <Text style={ui.small}>{t.meetEmpty}</Text>}
            <Text accessibilityRole="header" style={ui.heading}>{t.pairGoals}</Text><Text style={ui.small}>{t.pairRules}</Text>
            {friends.length > 0 ? <View style={ui.card}><Disclosure title={t.pairCreate}>
              <Options label={t.pairFriend} values={friends.map(person => [person.id,person.name])}
                value={friend ?? friends[0].id} onChange={setFriend} />
              <Field label={t.pairTarget} keyboardType="number-pad" value={target} onChangeText={setTarget} maxLength={2} />
              <View style={styles.privacy}><Text style={[ui.small,{ flex:1 }]}>{t.pairAvatar}</Text>
                <Switch accessibilityLabel={t.pairAvatar} value={avatar} onValueChange={setAvatar} /></View>
              <Button disabled={working} onPress={() => modify('createGoal',friend ?? friends[0].id,{ target: Number(target), avatar })}>
                {t.pairCreate}
              </Button>
            </Disclosure></View> : <Text style={ui.small}>{t.pairNoFriends}</Text>}
            {list.data.goals.length ? list.data.goals.map(goal) : <Text style={ui.small}>{t.pairEmpty}</Text>}
          </>}
      </ScrollView>
      <View style={ui.row}>{selected && <Button muted onPress={() => setSelected(undefined)}>{t.tourPrevious}</Button>}
        <Button muted onPress={close}>{t.done}</Button></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  sheet: { width: '100%', maxWidth: 500, maxHeight: '94%' },
  content: { gap: 10, paddingBottom: 8 },
  privacy: { flexDirection:'row', gap:5, alignItems:'center' },
  roomPicker: { marginBottom: 5 },
});
