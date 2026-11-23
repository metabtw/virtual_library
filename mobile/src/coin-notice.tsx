import { getItemAsync, setItemAsync } from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { coinReasonLabels, readCoinReceipts, takeNextCoinAward, type CoinAward } from '../../public/coin-notices';
import type { Locale, Translation } from './strings';

export function CoinNotice({ awards, account, enabled, locale, t }: {
  awards?: CoinAward[]; account: string; enabled: boolean; locale: Locale; t: Translation;
}) {
  const storageKey = 'vsc-coins.' + account;
  const receipts = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [shown, show] = useState<CoinAward>();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let mounted = true;
    void getItemAsync(storageKey).catch(() => null).then(serialized => {
      if (!mounted) return;
      receipts.current = readCoinReceipts(serialized);
      setReady(true);
    });
    return () => { mounted = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!ready || !enabled || shown) return;
    const next = takeNextCoinAward(awards, receipts.current);
    if (!next) return;
    show(next);
    void setItemAsync(storageKey, JSON.stringify([...receipts.current])).catch(() => {});
  }, [awards, enabled, ready, shown, storageKey]);

  useEffect(() => {
    if (!shown) return;
    const expiry = setTimeout(() => show(undefined), 4800);
    return () => clearTimeout(expiry);
  }, [shown]);

  if (!enabled || !shown) return null;
  const amount = new Intl.NumberFormat(locale).format(shown.amount);
  return <View pointerEvents="none" style={[styles.layer, { top: Math.max(8, insets.top) }]}>
    <View style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text accessible={false} style={styles.icon}>◉</Text>
      <View style={styles.copy}>
        <Text style={styles.title}>{t.coinEarned.replace('{amount}', amount)}</Text>
        <Text style={styles.reason}>{t[coinReasonLabels[shown.reason]]}</Text>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 12, right: 12, zIndex: 20, alignItems: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 420,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 13, borderWidth: 1,
    borderColor: '#dc9960', backgroundColor: '#382535', elevation: 5 },
  icon: { fontSize: 23, color: '#ffd285' },
  copy: { flex: 1, gap: 2 },
  title: { color: '#ffe7bb', fontWeight: '700' },
  reason: { color: '#e9c7ad', fontSize: 12 },
});
