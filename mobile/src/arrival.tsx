import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { waitForPage } from '../../public/page-loading';
import { loadingPixels, tourSteps } from '../../public/onboarding';
import { roomThemes } from './themes';
import type { Translation } from './strings';
import { Button, ui } from './ui';

export function LoadingScreen({ label }: { label: string }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    const loop = Animated.loop(Animated.timing(turn, {
      toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }));
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (alive && !reduced) loop.start();
    }).catch(() => {});
    return () => { alive = false; loop.stop(); };
  }, [turn]);

  return <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
    <View style={styles.mark}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{
        rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
      }] }]}>
        {loadingPixels.map(({ x, y, opacity }) => <View key={x + ':' + y} style={[styles.pixel, { left: x - 4, top: y - 4, opacity }]} />)}
      </Animated.View>
      <Image source={require('../../public/app-logo.png')} style={styles.logo} resizeMode="contain" accessible={false} />
    </View>
    <Text style={ui.small}>{label}</Text>
  </View>;
}

export function PageLoading({ page, blocked, assets, label }: {
  page: string; blocked: boolean; assets: () => number[]; label: string;
}) {
  const lastPage = useRef(page);
  const getAssets = useRef(assets);
  getAssets.current = assets;
  const [showing, setShowing] = useState(false);
  useLayoutEffect(() => {
    const changed = lastPage.current !== page;
    lastPage.current = page;
    setShowing(changed && !blocked);
    if (!changed || blocked) return;
    let mounted = true;
    const tasks = getAssets.current().map(module => Asset.fromModule(module).downloadAsync());
    void waitForPage(tasks).then(() => { if (mounted) setShowing(false); });
    return () => { mounted = false; };
  }, [blocked, page]);
  if (!showing || blocked) return null;
  return <Modal transparent visible animationType="none" onRequestClose={() => {}} accessibilityViewIsModal>
    <LoadingScreen label={label} />
  </Modal>;
}

export function TourSheet({ t, finish, pending, error }: { t: Translation; finish: () => void; pending: boolean; error: string }) {
  const [index, setIndex] = useState(0);
  const item = tourSteps[index];
  const last = index === tourSteps.length - 1;
  return <Modal visible transparent onRequestClose={() => { if (!pending) finish(); }} accessibilityViewIsModal>
    <View style={ui.modal}>
      <View style={[ui.card, styles.sheet]}>
        <ScrollView contentContainerStyle={styles.tourContent}>
          <Text style={ui.accent}>{t.tourTitle}</Text>
          <Image source={roomThemes[item.art].image} style={styles.tourArt} resizeMode="cover" accessible={false} />
          <Text accessibilityRole="header" style={ui.heading}>{t[item.title]}</Text>
          <Text style={styles.copy}>{t[item.body]}</Text>
        </ScrollView>
        {error !== '' && <Text accessibilityLiveRegion="polite" style={ui.warning}>{error}</Text>}
        <View style={ui.row}>
          <View style={styles.button}><Button compact muted disabled={pending} onPress={finish}>{t.tourSkip}</Button></View>
          <Text style={ui.small}>{index + 1} / {tourSteps.length}</Text>
          <View style={styles.button}><Button compact disabled={pending} onPress={last ? finish : () => setIndex(index + 1)}>
            {last ? t.tourStart : t.tourNext}
          </Button></View>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, backgroundColor: '#1b1620' },
  mark: { width: 192, height: 192, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 126, height: 126 },
  pixel: { position: 'absolute', width: 8, height: 8, backgroundColor: '#ffbd7e' },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '90%' },
  tourContent: { gap: 10 },
  tourArt: { height: 128, width: '100%', borderRadius: 12 },
  copy: { color: '#dfc2b6', fontSize: 15, lineHeight: 22 },
  button: { flex: 1 },
});
