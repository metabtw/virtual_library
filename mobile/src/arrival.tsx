import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { waitForPage } from '../../public/page-loading';
import { loadingPixels, tourSteps } from '../../public/onboarding';
import type { Translation } from './strings';
import { Button, ui } from './ui';

const tourImages = {
  rooms: require('../../public/tour/rooms.webp'),
  private: require('../../public/tour/private.webp'),
  focus: require('../../public/tour/focus.webp'),
  verify: require('../../public/tour/verify.webp'),
  break: require('../../public/tour/break.webp'),
  coins: require('../../public/tour/coins.webp'),
  goal: require('../../public/tour/goal.webp'),
  chests: require('../../public/tour/chests.webp'),
  avatar: require('../../public/tour/avatar.webp'),
  friends: require('../../public/tour/friends.webp'),
  planner: require('../../public/tour/planner.webp'),
  shop: require('../../public/tour/shop.webp'),
  quests: require('../../public/tour/quests.webp'),
  games: require('../../public/tour/games.webp'),
  account: require('../../public/tour/account.webp'),
};

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
  const [expanded, setExpanded] = useState(false);
  const tabStrip = useRef<ScrollView>(null);
  const [stripWidth, setStripWidth] = useState(0);
  useEffect(() => {
    if (stripWidth) tabStrip.current?.scrollTo({ x: Math.max(0, index * 43 - (stripWidth - 38) / 2), animated: false });
  }, [expanded, index, stripWidth]);
  const item = tourSteps[index];
  const source = tourImages[item.image];
  const asset = Image.resolveAssetSource(source);
  const aspect = asset?.width && asset.height ? asset.width / asset.height : 1.55;
  const last = index === tourSteps.length - 1;
  return <Modal visible transparent onRequestClose={() => { if (expanded) setExpanded(false); else if (!pending) finish(); }} accessibilityViewIsModal>
    <View style={ui.modal}>
      {expanded ? <View style={[ui.card, styles.sheet, styles.lightbox]}>
        <Button compact muted onPress={() => setExpanded(false)}>{t.tourPrevious}</Button>
        <ScrollView>
          <ScrollView horizontal>
            <Image source={source} style={{ width: 720, height: 720 / aspect }} resizeMode="contain" accessibilityLabel={t[item.title]} />
          </ScrollView>
        </ScrollView>
      </View> : <View style={[ui.card, styles.sheet]}>
        <ScrollView contentContainerStyle={styles.tourContent}>
          <View style={styles.tourHeader}>
            <Text style={ui.accent}>{t.tourOpen}</Text>
            <Button compact muted disabled={pending} onPress={finish}>{t.tourSkip}</Button>
          </View>
          <ScrollView ref={tabStrip} horizontal contentContainerStyle={styles.tabs}
            onLayout={event => setStripWidth(event.nativeEvent.layout.width)}>
            {tourSteps.map((step, n) => <Pressable key={step.image} accessibilityRole="button"
              accessibilityLabel={t[step.title]} accessibilityState={{ selected: n === index, disabled: pending }}
              style={[styles.tab, n === index && styles.tabActive]} disabled={pending} onPress={() => setIndex(n)}>
              <Text style={n === index ? styles.tabTextActive : ui.small}>{n + 1}</Text>
            </Pressable>)}
          </ScrollView>
          <Text accessibilityRole="header" style={ui.heading}>{t[item.title]}</Text>
          <Text style={styles.copy}>{t[item.body]}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.tourOpenImage} onPress={() => setExpanded(true)}>
            <Image source={source} style={[styles.tourArt, { aspectRatio: Math.max(1.18, Math.min(2.4, aspect)) }]}
              resizeMode="contain" accessible={false} />
            <Text accessible={false} style={styles.expandIcon}>↗</Text>
          </Pressable>
        </ScrollView>
        {error !== '' && <Text accessibilityLiveRegion="polite" style={ui.warning}>{error}</Text>}
        <View style={ui.row}>
          <View style={styles.button}><Button compact muted disabled={pending || !index}
            onPress={() => setIndex(index - 1)}>{t.tourPrevious}</Button></View>
          <Text style={ui.small}>{index + 1} / {tourSteps.length}</Text>
          <View style={styles.button}><Button compact disabled={pending} onPress={last ? finish : () => setIndex(index + 1)}>
            {last ? t.tourStart : t.tourNext}
          </Button></View>
        </View>
      </View>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, backgroundColor: '#1b1620' },
  mark: { width: 192, height: 192, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 126, height: 126 },
  pixel: { position: 'absolute', width: 8, height: 8, backgroundColor: '#ffbd7e' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%' },
  tourContent: { gap: 10, paddingBottom: 10 },
  tourHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tourArt: { width: '100%', backgroundColor: '#201923', borderRadius: 12 },
  lightbox: { gap: 10 },
  expandIcon: { position: 'absolute', bottom: 6, right: 6, color: '#fff0dc',
    backgroundColor: '#241b26', paddingHorizontal: 6, borderRadius: 5 },
  tabs: { gap: 5, paddingBottom: 5 },
  tab: { width: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#75546e', borderRadius: 6 },
  tabActive: { backgroundColor: '#ffbd7e', borderColor: '#ffbd7e' },
  tabTextActive: { color: '#251923', fontWeight: '800' },
  copy: { color: '#dfc2b6', fontSize: 15, lineHeight: 22 },
  button: { flex: 1 },
});
