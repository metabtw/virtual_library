import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { inviteWait, splitProfileCode, type ProfileCodePrefix } from '../../public/room-social';
import type { Answer, DailyQuests as Quests, Friend, Profile, StudyInvite } from './model';
import type { Locale, Translation } from './strings';
import { Button, ui } from './ui';

export function ProfileCodeField({ label, prefix, value, onChange, onPrefixChange, t }: {
  label: string; prefix: ProfileCodePrefix; value: string; onChange: (value: string) => void;
  onPrefixChange?: (prefix: ProfileCodePrefix) => void; t: Translation;
}) {
  return <View style={ui.field}>
    <Text style={ui.small}>{label}</Text>
    <View style={styles.codeField}>
      {onPrefixChange ? <Pressable style={styles.prefix} accessibilityRole="button"
        accessibilityLabel={`${t.switchCodePrefix} · ${prefix}-`} onPress={() => onPrefixChange(prefix === 'DV' ? 'SK' : 'DV')}>
        <Text style={ui.accent}>{prefix}-</Text></Pressable> : <View style={styles.prefix}><Text style={ui.accent}>{prefix}-</Text></View>}
      <TextInput style={[ui.input, styles.codeInput]} value={value} accessibilityLabel={label} maxLength={15}
        autoCapitalize="characters" autoCorrect={false} onChangeText={input => {
          const parsed = splitProfileCode(input, prefix);
          if (onPrefixChange) onPrefixChange(parsed.prefix);
          onChange(onPrefixChange || parsed.prefix === prefix ? parsed.suffix : '');
        }} />
    </View>
  </View>;
}

function ProfileCode({ label, code, t, shareable = true }: {
  label: string; code: string; t: Translation; shareable?: boolean;
}) {
  const [feedback, setFeedback] = useState<'codeCopied' | 'codeCopyError' | 'codeShareError'>();

  async function copy() {
    const copied = await setStringAsync(code).catch(() => false);
    setFeedback(copied ? 'codeCopied' : 'codeCopyError');
  }

  async function share() {
    setFeedback(undefined);
    try {
      await Share.share({ title: t.app, message: `${t.app} · ${label} ${code}` });
    } catch { setFeedback('codeShareError'); }
  }

  return <View style={styles.code}>
    <Text style={ui.small}>{label}</Text>
    <Text selectable style={ui.accent}>{code}</Text>
    <View style={styles.codeActions}>
      <View style={styles.codeAction}><Button compact muted accessibilityLabel={`${t.copyCode} · ${label}`} onPress={() => void copy()}>{t.copyCode}</Button></View>
      {shareable && <View style={styles.codeAction}><Button compact muted accessibilityLabel={`${t.shareCode} · ${label}`} onPress={() => void share()}>{t.shareCode}</Button></View>}
    </View>
    {feedback && <Text accessibilityLiveRegion="polite" style={ui.small}>{t[feedback]}</Text>}
  </View>;
}

export function ProfileCodes({ profile, accountId, t }: { profile: Profile; accountId: string; t: Translation }) {
  const reader = profile.shortReaderCode || profile.readerCode;
  const referral = profile.shortReferralCode || profile.referralCode;
  return <View style={styles.codes}>
    <ProfileCode key={reader || accountId} label={reader ? t.readerCode : t.accountId} code={reader ? splitProfileCode(reader).suffix : accountId} shareable={!!reader} t={t} />
    {referral && <ProfileCode key={referral} label={t.referralCode} code={splitProfileCode(referral).suffix} t={t} />}
  </View>;
}

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

export function StudyInvitations({ invites, locale, pending, now, t, answer }: {
  invites?: StudyInvite[]; locale: Locale; pending: boolean; now: number; t: Translation; answer: (id: string, answer: Answer) => void;
}) {
  const active = invites?.filter(invite => !invite.expiresAt || invite.expiresAt > now);
  if (!active?.length) return null;
  return <View style={ui.card}>
    <Text style={ui.heading}>{t.studyInvites}</Text>
    {active.map(invite => <View key={invite.id} style={styles.entry}>
      <Text style={ui.heading}>{invite.name}</Text>
      <Text style={ui.small}>{locale === 'en' ? invite.room_en : invite.room}{invite.private ? ' · ' + t.privateBadge : ''}</Text>
      {!!invite.expiresAt && <Text style={ui.small}>{t.inviteExpires} · {inviteWait(invite.expiresAt, now)} {t.secondsShort}</Text>}
      <View style={styles.actions}>
        <Button disabled={pending} onPress={() => answer(invite.id, 'accept')}>{t.join}</Button>
        <Button muted disabled={pending} onPress={() => answer(invite.id, 'reject')}>{t.reject}</Button>
      </View>
    </View>)}
  </View>;
}

export function FriendInviteButton({ friend, label, pending, now, t, onPress }: {
  friend: Friend; label?: string; pending: boolean; now: number; t: Translation; onPress: () => void;
}) {
  if (friend.inRoom) return <Text style={ui.accent}>{label ? label + ' · ' : ''}{t.friendInRoom}</Text>;
  const seconds = inviteWait(friend.inviteRetryAt, now);
  return <Button muted disabled={pending || seconds > 0} onPress={onPress}>
    {label ?? t.studyInvite}{seconds ? ` · ${seconds} ${t.secondsShort}` : ''}
  </Button>;
}

export function FriendsPanel({ profile, friends = [], pending, now, t, add, answer, remove, invite }: {
  profile: Profile; friends?: Friend[]; pending: boolean; now: number; t: Translation;
  add: (code: string) => void; answer: (id: string, answer: Answer) => void;
  remove: (id: string) => void; invite: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  if (!profile.readerCode) return null;
  return <View style={ui.card}>
    <Text style={ui.heading}>{t.friends}</Text>
    {!!profile.referralCode && <Text style={ui.small}>{t.referralInfo}</Text>}
    <ProfileCodeField label={t.friendId} prefix="SK" value={code} onChange={setCode} t={t} />
    <Button disabled={pending || code.length < 5} onPress={() => add(`SK-${code}`)}>{t.addFriend}</Button>
    {!friends.length && <Text style={ui.small}>{t.noFriends}</Text>}
    {friends.map(friend => <View style={styles.entry} key={friend.id}>
      <Text style={ui.heading}>{friend.name}</Text>
      <Text style={ui.small}>{splitProfileCode(friend.shortCode || friend.code).suffix}{friend.status === 'sent' ? ' · ' + t.friendSent
        : friend.status === 'incoming' ? ' · ' + t.friendIncoming : ''}</Text>
      <View style={styles.actions}>
        {friend.status === 'incoming' ? <>
          <Button disabled={pending} onPress={() => answer(friend.id, 'accept')}>{t.friendAccept}</Button>
          <Button muted disabled={pending} onPress={() => answer(friend.id, 'reject')}>{t.reject}</Button>
        </> : <>
          {friend.status === 'accepted' && profile.room &&
            <FriendInviteButton friend={friend} pending={pending} now={now} t={t} onPress={() => invite(friend.id)} />}
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
  codes: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  code: { flex: 1, minWidth: 0, padding: 6, gap: 5, backgroundColor: '#251d2aee', borderRadius: 9, borderColor: '#76545b', borderWidth: 1 },
  codeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 'auto' },
  codeAction: { flexBasis: 53, flexGrow: 1, minWidth: 0 },
  codeField: { flexDirection: 'row' },
  prefix: { justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: '#76545b',
    borderTopLeftRadius: 10, borderBottomLeftRadius: 10, backgroundColor: '#251d2a' },
  codeInput: { flex: 1, minWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 },
  entry: { borderTopWidth: 1, borderTopColor: '#76545b', paddingTop: 9, gap: 5 },
});
