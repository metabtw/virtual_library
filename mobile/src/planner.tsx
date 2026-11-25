import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { changeMonth, dayActivity, dayLabel, monthCells, newPlan, plannerToday, type StudyDraft } from '../../public/study-planner';
import { studyPlanner } from './api';
import { message, type Locale, type Translation } from './strings';
import { Button, Field, ui } from './ui';

export function StudyPlanner({ id, locale, t }: { id: string; locale: Locale; t: Translation }) {
  const [day, setDay] = useState(plannerToday);
  const [draft, edit] = useState<StudyDraft>();
  const [success, setSuccess] = useState(false);
  const [questionsEnabled, setQuestionsEnabled] = useState(false);
  const month = day.slice(0, 7);
  const key = ['studyPlanner', id, month];
  const cache = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: () => studyPlanner({ month }), staleTime: 0 });
  const calendar = query.data;
  const today = calendar?.today ?? plannerToday();
  const activity = dayActivity(calendar, day);
  const update = useMutation({
    mutationFn: (entry: object) => studyPlanner({ month, ...entry }),
    onSuccess: result => {
      cache.setQueryData(key, result);
      edit(undefined);
      setSuccess(true);
      void cache.invalidateQueries({ queryKey: ['library', id] });
    },
  });
  const minutes = (count: number) => `${count} ${t.minuteUnit}`;
  const questionCount = (count: number) => `${count} ${t.plannerQuestionUnit}`;
  function select(date: string) {
    update.reset();
    setSuccess(false);
    edit(undefined);
    setDay(date);
  }
  function form(next: StudyDraft | undefined) {
    update.reset();
    setSuccess(false);
    setQuestionsEnabled(Boolean(next?.questions || next?.solved));
    edit(next);
  }
  function remove(id: string) {
    Alert.alert(t.plannerRemove, t.plannerRemoveConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.plannerRemove, style: 'destructive', onPress: () => update.mutate({ op: 'remove', id }) },
    ]);
  }
  const pending = update.isPending;
  const numericalField = (name: 'minutes' | 'questions' | 'logged_minutes' | 'solved', label: string, max: number) =>
    draft && <Field label={label} value={draft[name] ? String(draft[name]) : ''} keyboardType="number-pad"
      onChangeText={value => edit({ ...draft, [name]: Math.min(max, Number(value.replace(/\D/g, ''))) })}
      maxLength={String(max).length} />;
  const future = day > today;
  return <View style={ui.card}>
    <View style={styles.heading}><Text accessibilityRole="header" style={[ui.heading, styles.title]}>{t.planner}</Text>
      <Button muted compact disabled={pending} onPress={() => select(today)}>{t.plannerToday}</Button></View>
    <Text style={ui.small}>{t.plannerPrivate}</Text>
    <View style={styles.heading}>
      <Button muted compact disabled={pending} accessibilityLabel={t.plannerPrevious} onPress={() => select(changeMonth(month,-1)+'-01')}>‹</Button>
      <Text style={ui.ink}>{dayLabel(month,locale,true)}</Text>
      <Button muted compact disabled={pending} accessibilityLabel={t.plannerNext} onPress={() => select(changeMonth(month,1)+'-01')}>›</Button>
    </View>
    <View style={styles.grid}>
      {t.plannerWeekdays.split(',').map(label => <Text key={label} style={[ui.small,styles.weekday]}>{label}</Text>)}
      {monthCells(month).map((date,index) => {
        if (!date) return <View key={index} style={styles.dateWidth} />;
        const summary = dayActivity(calendar,date);
        return <Pressable key={date} disabled={pending} style={styles.dateWidth}
          onPress={() => select(date)} accessibilityRole="button" accessibilityState={{ selected: day===date }}
          accessibilityLabel={dayLabel(date,locale)+' · '+minutes(summary.minutes)}>
          <View style={[styles.date, date===today && styles.today, day===date && styles.selected]}>
            <Text style={ui.ink}>{Number(date.slice(-2))}</Text>
            {summary.minutes > 0 || summary.plans.length > 0 ? <View style={styles.marker} /> : null}
          </View>
        </Pressable>;
      })}
    </View>
    <View style={styles.heading}><Text style={[ui.heading, styles.title]}>{dayLabel(day,locale)}</Text>
      <Button muted compact disabled={pending || query.isError || query.isPending} onPress={() => form(newPlan(day))}>{t.plannerAdd}</Button>
    </View>
    <View style={styles.totals}>
      <Text style={ui.accent}>{minutes(activity.minutes)}{activity.target ? ' / '+activity.target : ''}</Text>
      <Text style={ui.accent}>{questionCount(activity.solved)}{activity.questions ? ' / '+activity.questions : ''}</Text>
    </View>
    {activity.recorded > 0 && <Text style={ui.small}>{t.plannerRecorded} · {minutes(activity.recorded)}</Text>}
    {query.isPending && <Text style={ui.small}>{t.loading}</Text>}
    {query.isError && <><Text style={ui.warning}>{message(t,query.error)}</Text>
      <Button muted onPress={() => void query.refetch()}>{t.retry}</Button></>}
    {update.isError && <Text accessibilityLiveRegion="polite" style={ui.warning}>{message(t,update.error)}</Text>}
    {success && <Text accessibilityLiveRegion="polite" style={ui.accent}>{t.plannerReady}</Text>}
    {draft && <View style={styles.entry}>
      <Field label={t.plannerTopic} value={draft.topic} maxLength={100} onChangeText={topic => edit({ ...draft, topic })} />
      {numericalField('minutes',t.plannerMinutes,1440)}
      {!future && numericalField('logged_minutes',t.plannerLogged,1440)}
      <View style={styles.heading}><Text style={[ui.ink,styles.title]}>{t.plannerQuestionToggle}</Text>
        <Switch value={questionsEnabled} onValueChange={setQuestionsEnabled} accessibilityLabel={t.plannerQuestionToggle} /></View>
      {questionsEnabled && <>
        {numericalField('questions',t.plannerQuestions,10000)}
        {!future && numericalField('solved',t.plannerSolved,10000)}
      </>}
      <Field label={t.plannerReminder} value={draft.reminder} placeholder="19:30"
        maxLength={5} onChangeText={reminder => edit({ ...draft, reminder })} />
      <Text style={ui.small}>{t.plannerReminderHelp}</Text>
      <Text style={ui.ink}>{t.plannerNotes}</Text>
      <TextInput accessibilityLabel={t.plannerNotes} style={[ui.input,styles.notes]} multiline maxLength={500} value={draft.notes}
        onChangeText={notes => edit({ ...draft,notes })} />
      <Button disabled={pending || !draft.topic.trim() || Boolean(draft.reminder && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(draft.reminder))}
        onPress={() => update.mutate({ op: 'save', ...draft, ...(!questionsEnabled ? { questions: 0, solved: 0 } : {}) })}>{pending ? t.loading : t.plannerSave}</Button>
      <Button muted disabled={pending} onPress={() => form(undefined)}>{t.cancel}</Button>
      {draft.id && <Button tone="danger" disabled={pending} onPress={() => remove(draft.id!)}>{t.plannerRemove}</Button>}
    </View>}
    {!draft && query.isSuccess && !activity.plans.length && !activity.sessions.length && <Text style={ui.small}>{t.plannerEmpty}</Text>}
    {activity.plans.map(plan => {
      const recorded = activity.sessions.filter(entry => entry.planId === plan.id).reduce((sum,entry) => sum+entry.minutes,0);
      return <View key={plan.id} style={styles.entry}>
        <Text style={ui.heading}>{plan.topic}</Text>
        <Text style={ui.accent}>{minutes(plan.logged_minutes+recorded)} / {plan.minutes} · {questionCount(plan.solved)} / {plan.questions}</Text>
        {plan.reminder && <Text style={ui.small}>{t.plannerReminder} · {plan.reminder.slice(0,5)}</Text>}
        {!!plan.notes && <Text style={ui.small}>{plan.notes}</Text>}
        <Button compact muted disabled={pending} onPress={() => form({ ...plan,reminder: plan.reminder?.slice(0,5) ?? '' })}>{t.plannerEdit}</Button>
      </View>;
    })}
    {!!activity.sessions.length && <>
      <Text accessibilityRole="header" style={ui.heading}>{t.plannerHistory}</Text>
      {activity.sessions.map(entry => <View key={entry.id} style={styles.heading}>
        <Text style={[ui.small,styles.title]}>{entry.topic ?? t.plannerUntitled}</Text><Text style={ui.accent}>{minutes(entry.minutes)}</Text>
      </View>)}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dateWidth: { width: '14.2857%', padding: 2 },
  weekday: { width: '14.2857%', textAlign: 'center', marginBottom: 3 },
  date: { minHeight: 39, gap: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 5,
    borderWidth: 1, borderColor: '#644653', backgroundColor: '#281d2b' },
  today: { borderColor: '#c99469' },
  selected: { backgroundColor: '#624153', borderColor: '#ffb66c' },
  marker: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#ffba7a' },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  entry: { gap: 8, backgroundColor: '#291d2b', borderRadius: 9, borderWidth: 1, borderColor: '#644653', padding: 10 },
  notes: { minHeight: 70, textAlignVertical: 'top' },
});
