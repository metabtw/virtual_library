import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { defaultRoomTheme, type RoomBackdrop } from '../../public/room-art';
import type { ThemeChoice } from './model';
import type { Translation } from './strings';
import { Button, ui } from './ui';

type Palette = { border: string; accent: string; desk: string; shadow: string };

export const roomThemes: Record<RoomBackdrop, { image: number; palette: Palette }> = {
  classic: { image: require('../../public/library.webp'), palette: {
    border: '#b77c66', accent: '#ffdbab', desk: '#a66a4a', shadow: '#603837',
  } },
  rain: { image: require('../assets/themes/rain.webp'), palette: {
    border: '#778ab2', accent: '#c0d8ff', desk: '#685779', shadow: '#3a3055',
  } },
  garden: { image: require('../assets/themes/garden.webp'), palette: {
    border: '#779e83', accent: '#e1efaf', desk: '#63836a', shadow: '#344f43',
  } },
  stars: { image: require('../assets/themes/stars.webp'), palette: {
    border: '#a083bd', accent: '#edd1ff', desk: '#786492', shadow: '#45385f',
  } },
  aurora: { image: require('../assets/aurora.webp'), palette: {
    border: '#72a492', accent: '#d3fbd1', desk: '#4e7f70', shadow: '#36584d',
  } },
  'old-archive': { image: require('../assets/themes/old-archive.webp'), palette: {
    border: '#b78862', accent: '#ffcd8e', desk: '#89573e', shadow: '#4f3631',
  } },
  'rain-terrace': { image: require('../assets/themes/rain-terrace.webp'), palette: {
    border: '#778ab2', accent: '#c0d8ff', desk: '#685779', shadow: '#3a3055',
  } },
  'aurora-observatory': { image: require('../assets/themes/aurora-observatory.webp'), palette: {
    border: '#72a492', accent: '#d3fbd1', desk: '#4e7f70', shadow: '#36584d',
  } },
  'japanese-garden': { image: require('../assets/themes/japanese-garden.webp'), palette: {
    border: '#b67691', accent: '#ffd4e1', desk: '#915a76', shadow: '#4c344b',
  } },
  'mathematics': { image: require('../assets/themes/mathematics.webp'), palette: {
    border: '#6d9dbd', accent: '#c3ebff', desk: '#4e6e91', shadow: '#303c60',
  } },
  'history': { image: require('../assets/themes/history.webp'), palette: {
    border: '#9f9269', accent: '#eee0a4', desk: '#786446', shadow: '#444030',
  } },
  'science': { image: require('../assets/themes/science.webp'), palette: {
    border: '#669fa4', accent: '#b8f4e9', desk: '#527d83', shadow: '#2d4c59',
  } },
  'literature': { image: require('../assets/themes/literature.webp'), palette: {
    border: '#a37f97', accent: '#fdd3e2', desk: '#8b5c71', shadow: '#4d354b',
  } },
  'languages': { image: require('../assets/themes/languages.webp'), palette: {
    border: '#bf8c6d', accent: '#fedbb3', desk: '#a66e56', shadow: '#623e3a',
  } },
  'art': { image: require('../assets/themes/art.webp'), palette: {
    border: '#a57ba6', accent: '#f5d7ff', desk: '#926892', shadow: '#523f60',
  } },
};

export function resolveTheme(choice: ThemeChoice, room: string | null, aurora: boolean): RoomBackdrop {
  return choice === 'auto' ? defaultRoomTheme(room, aurora) : choice;
}

const labels = {
  auto: 'themeAuto',
  classic: 'themeClassic',
  rain: 'themeRain',
  garden: 'themeGarden',
  stars: 'themeStars',
} as const satisfies Record<ThemeChoice, keyof Translation>;

export function ThemePicker({ value, room, aurora, onChange, t }: {
  value: ThemeChoice; room: string; aurora: boolean; onChange: (choice: ThemeChoice) => void; t: Translation;
}) {
  const [open, setOpen] = useState(false);
  const active = roomThemes[resolveTheme(value, room, aurora)];
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t.themeTitle}: ${t[labels[value]]}`}
      onPress={() => setOpen(true)} style={[styles.trigger, { borderColor: active.palette.border }]}>
      <Text style={styles.label}>{t.themeTitle}</Text>
      <View style={styles.current}>
        <Text style={[ui.small, { color: active.palette.accent }]}>{t[labels[value]]}</Text>
        <Text style={ui.small} aria-hidden>›</Text>
      </View>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} accessibilityViewIsModal>
      <View style={ui.modal}>
        <View style={[ui.card, styles.sheet]}>
          <Text style={ui.heading}>{t.themeTitle}</Text>
          <ScrollView contentContainerStyle={styles.choices}>
            {(Object.keys(labels) as ThemeChoice[]).map(choice => {
              const preview = roomThemes[resolveTheme(choice, room, aurora)];
              const selected = choice === value;
              return <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                onPress={() => { onChange(choice); setOpen(false); }}
                style={[styles.choice, selected && { borderColor: preview.palette.accent, borderWidth: 2 }]}>
                <Image source={preview.image} accessible={false} style={styles.preview} resizeMode="cover" />
                <Text style={styles.choiceText}>{t[labels[choice]]} {selected ? '✓' : ''}</Text>
              </Pressable>;
            })}
          </ScrollView>
          <Button muted onPress={() => setOpen(false)}>{t.done}</Button>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8,
    backgroundColor: '#231d2a', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 14,
  },
  label: { color: '#fff0dc', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '87%' },
  choices: { gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#76545b',
    borderRadius: 10, backgroundColor: '#241c2a', padding: 5, minHeight: 48 },
  preview: { width: 78, height: 44, borderRadius: 6 },
  choiceText: { color: '#fff0dc', fontWeight: '600', flexShrink: 1 },
});
