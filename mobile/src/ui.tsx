import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

const buttonTones = {
  data: { surface: { backgroundColor: '#24456a', borderColor: '#5687b7', borderWidth: 1 }, label: { color: '#d6eaff' } },
  signOut: { surface: { backgroundColor: '#5a451d', borderColor: '#a1803e', borderWidth: 1 }, label: { color: '#ffe698' } },
  terms: { surface: { backgroundColor: '#3b2b50', borderColor: '#77568f', borderWidth: 1 }, label: { color: '#f2dcff' } },
  danger: { surface: { backgroundColor: '#642934', borderColor: '#b75e69', borderWidth: 1 }, label: { color: '#ffd9d8' } },
};

export function Button({ children, onPress, disabled, muted, compact, tone, accessibilityLabel }: {
  children: ReactNode; onPress: () => void; disabled?: boolean; muted?: boolean; compact?: boolean;
  tone?: keyof typeof buttonTones; accessibilityLabel?: string;
}) {
  const colors = tone ? buttonTones[tone] : undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ui.button, compact && ui.compactButton, muted && ui.mutedButton, colors?.surface, (disabled || pressed) && { opacity: .54 }]}>
    <Text style={[ui.buttonText, compact && ui.compactButtonText, muted && ui.ink, colors?.label]}>{children}</Text>
  </Pressable>;
}

export function Disclosure({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={disclosureStyles.header} onPress={() => setOpen(expanded => !expanded)}>
      <Text style={[ui.ink, disclosureStyles.title]}>{title}</Text>
      {hint && <Text style={ui.small}>{hint}</Text>}
      <Text accessible={false} style={ui.accent}>{open ? '▴' : '▾'}</Text>
    </Pressable>
    {open && <View style={disclosureStyles.content}>{children}</View>}
  </View>;
}

const disclosureStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  title: { flex: 1, fontWeight: '700' },
  content: { gap: 8, paddingTop: 4 },
});

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={ui.field}>
    <Text style={ui.small}>{label}</Text>
    <TextInput accessibilityLabel={label} style={ui.input} placeholderTextColor="#a88b91" {...props} />
  </View>;
}

export function Options<T extends string | number>({ label, values, value, onChange }: {
  label?: string; values: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void;
}) {
  return <View style={ui.field}>
    {!!label && <Text style={ui.small}>{label}</Text>}
    <View style={ui.options}>
      {values.map(([id, name]) => <Pressable key={id} accessibilityRole="radio"
        accessibilityState={{ checked: id === value }} onPress={() => onChange(id)}
        style={[ui.chip, id === value && ui.selected]}>
        <Text style={ui.ink}>{name}</Text>
      </Pressable>)}
    </View>
  </View>;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1b1620' },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 620, alignSelf: 'center' },
  card: { backgroundColor: '#342632', borderRadius: 18, borderWidth: 1, borderColor: '#76545b', padding: 14, gap: 10 },
  title: { color: '#fff0dc', fontSize: 26, fontWeight: '800' },
  heading: { color: '#fff0dc', fontSize: 18, fontWeight: '700', flexShrink: 1 },
  ink: { color: '#fff0dc' },
  small: { color: '#dfc2b6', fontSize: 13 },
  warning: { color: '#ffb9ac' },
  accent: { color: '#ffbe7c', fontWeight: '700' },
  balance: {
    color: '#ffdb9c', backgroundColor: '#412d37', borderColor: '#9a6c53', borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, fontWeight: '700', fontSize: 13,
  },
  field: { gap: 5 },
  input: { color: '#fff0dc', borderRadius: 10, borderWidth: 1, borderColor: '#76545b',
    paddingHorizontal: 12, minHeight: 46, backgroundColor: '#251d2a', fontSize: 16 },
  button: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11,
    backgroundColor: '#ffb360', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#271722', fontWeight: '700', textAlign: 'center' },
  compactButton: { paddingHorizontal: 5, paddingVertical: 7 },
  compactButtonText: { fontSize: 12 },
  mutedButton: { backgroundColor: '#2b202e', borderColor: '#a77a70', borderWidth: 1 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#76545b', padding: 8 },
  selected: { backgroundColor: '#644037', borderColor: '#ffb360' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nav: { flexDirection: 'row', padding: 6, gap: 4, backgroundColor: '#342632', borderTopWidth: 1, borderColor: '#76545b' },
  navTab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, minHeight: 48 },
  navActive: { backgroundColor: '#4d353e', borderRadius: 10 },
  navText: { textAlign: 'center', color: '#dfc2b6', fontSize: 12 },
  timer: { color: '#ffbf7b', fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '800' },
  modal: { flex: 1, backgroundColor: '#120e19b0', alignItems: 'center', justifyContent: 'center', padding: 24 },
});
