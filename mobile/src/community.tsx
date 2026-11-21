import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { Answer, DailyQuests as Quests, Friend, Profile, StudyInvite } from './model';
import type { Locale, Translation } from './strings';
import { Button, Field, ui } from './ui';

export function DailyQuests({ quests, t }: { quests?: Quests; t: Translation }) {
  if (!quests) return null;
  return <View style={ui.card}>
    <Text style={ui.heading}>{t.dailyQuests}</Text>
    {quests.goals.map(goal => {
      const progress = Math.min(quests.minutes, goal.minutes);
      const label = `${t.todayFocus} · ${goal.minutes} ${t.minuteUnit}`;
      return <View key={goal.minutes} style={styles.quest}>
        <View style={styles.actions}><Text style={ui.ink}>{label}</Text><Text style={ui.accent}>+{goal.coins} {t.coins}</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel={label}
          accessibilityValue={{ min: 0, now: progress, max: goal.minutes }} style={styles.progress}>
          <View style={[styles.fill, { width: `${progress / goal.minutes * 100}%` }]} />
        </View>
        <Text style={ui.small}>{goal.completed ? '✓ ' + t.questCompleted : `${progress} / ${goal.minutes} ${t.minuteUnit}`}</Text>
      </View>;
    })}
  </View>;
}

export function StudyInvitations({ invites, locale, pending, t, answer }: {
  invites?: StudyInvite[]; locale: Locale; pending: boolean; t: Translation; answer: (id: string, answer: Answer) => void;
}) {
  if (!invites?.length) return null;
  return <View style={ui.card}>
    <Text style={ui.heading}>{t.studyInvites}</Text>
    {invites.map(invite => <View key={invite.id} style={styles.entry}>
      <Text style={ui.heading}>{invite.name}</Text>
      <Text style={ui.small}>{locale === 'en' ? invite.room_en : invite.room}{invite.private ? ' · ' + t.privateBadge : ''}</Text>
      <View style={styles.actions}>
        <Button disabled={pending} onPress={() => answer(invite.id, 'accept')}>{t.join}</Button>
        <Button muted disabled={pending} onPress={() => answer(invite.id, 'reject')}>{t.reject}</Button>
      </View>
    </View>)}
  </View>;
}

export function FriendsPanel({ profile, friends = [], pending, t, add, answer, remove, invite }: {
  profile: Profile; friends?: Friend[]; pending: boolean; t: Translation;
  add: (code: string) => void; answer: (id: string, answer: Answer) => void;
  remove: (id: string) => void; invite: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  if (!profile.readerCode) return null;
  const registrationCode = profile.referralCode;
  return <View style={ui.card}>
    <Text style={ui.heading}>{t.friends}</Text>
    {registrationCode && <>
      <Text style={ui.small}>{t.referralInfo}</Text>
      <Button muted onPress={() => void Share.share({ message: `${t.app} · ${t.referralCode} ${registrationCode}` }).catch(() => {})}>
        {t.shareRegistration}
      </Button>
    </>}
    <Field label={t.friendId} value={code} onChangeText={setCode} maxLength={15} autoCapitalize="characters" autoCorrect={false} />
    <Button disabled={pending || code.trim().length !== 15} onPress={() => add(code.trim())}>{t.addFriend}</Button>
    {!friends.length && <Text style={ui.small}>{t.noFriends}</Text>}
    {friends.map(friend => <View style={styles.entry} key={friend.id}>
      <Text style={ui.heading}>{friend.name}</Text>
      <Text style={ui.small}>{friend.code}{friend.status === 'sent' ? ' · ' + t.friendSent
        : friend.status === 'incoming' ? ' · ' + t.friendIncoming : ''}</Text>
      <View style={styles.actions}>
        {friend.status === 'incoming' ? <>
          <Button disabled={pending} onPress={() => answer(friend.id, 'accept')}>{t.friendAccept}</Button>
          <Button muted disabled={pending} onPress={() => answer(friend.id, 'reject')}>{t.reject}</Button>
        </> : <>
          {friend.status === 'accepted' && profile.room &&
            <Button disabled={pending} onPress={() => invite(friend.id)}>{t.studyInvite}</Button>}
          <Button muted disabled={pending} onPress={() => remove(friend.id)}>
            {friend.status === 'sent' ? t.friendCancel : t.friendRemove}
          </Button>
        </>}
      </View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  quest: { gap: 5, padding: 8, backgroundColor: '#261c29', borderRadius: 10 },
  progress: { height: 6, backgroundColor: '#523744', overflow: 'hidden', borderRadius: 6 },
  fill: { height: '100%', backgroundColor: '#c69a6b' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  entry: { borderTopWidth: 1, borderTopColor: '#76545b', paddingTop: 9, gap: 5 },
});
