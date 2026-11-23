import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { chestAssets } from './asset-art';
import { ItemIllustration } from './catalog';
import type { BoxTier, Item } from './model';
import type { Translation } from './strings';
import { Button, ui } from './ui';

const colors = { basic: '#ffb879', epic: '#cd9bfd', legendary: '#ffe189' };
const sparks = [[-70, -50], [-36, -62], [33, -65], [74, -36], [66, 38], [-75, 34]];
const size = 128;

export function ChestReward({ tier, item, title, t, close }: {
  tier: BoxTier; item?: Item; title: string; t: Translation; close: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const color = colors[tier];
  useEffect(() => {
    if (revealed) return;
    let active = true;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 1300, useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    });
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduced => {
      if (!active) return;
      if (reduced) setRevealed(true);
      else animation.start(({ finished }) => { if (finished && active) setRevealed(true); });
    });
    return () => { active = false; animation.stop(); };
  }, [progress, revealed]);

  const tilt = progress.interpolate({
    inputRange: [0, .18, .3, .37, .44, .51, .58, .65, 1],
    outputRange: ['0deg', '-7deg', '5deg', '-8deg', '8deg', '-5deg', '4deg', '0deg', '0deg'],
  });
  const lift = progress.interpolate({ inputRange: [0, .68, 1], outputRange: [0, 0, -36] });
  const fade = progress.interpolate({ inputRange: [0, .66, .76, 1], outputRange: [0, 0, 1, 0] });
  const burst = progress.interpolate({ inputRange: [0, .67, 1], outputRange: [0, 0, 1] });

  return <Modal visible transparent onRequestClose={close} accessibilityViewIsModal>
    <View style={ui.modal}><View style={[ui.card, styles.card, { borderColor: color }]}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[ui.heading, styles.text]}>
        {revealed ? t.prize : t.boxOpening}
      </Text>
      {revealed ? <>
        {item ? <ItemIllustration item={item} /> : <Text style={[styles.coin, { color }]} accessible={false}>◉</Text>}
        <Text accessibilityLiveRegion="polite" style={[ui.ink, styles.text, { color }]}>{title}</Text>
      </> : <View style={styles.stage} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.chest, { transform: [{ rotate: tilt }] }]}>
          <View style={[styles.layer, styles.base]}>
            <Image style={[styles.art, styles.baseImage]} source={chestAssets[tier]} accessible={false} />
          </View>
          <Animated.View style={[styles.layer, { transform: [{ translateY: lift }] }]}>
            <Image style={styles.art} source={chestAssets[tier]} accessible={false} />
          </Animated.View>
        </Animated.View>
        {sparks.map(([x, y]) => <Animated.Text key={x} style={[styles.spark, {
          color, opacity: fade, transform: [{ translateX: Animated.multiply(burst, x) }, { translateY: Animated.multiply(burst, y) }],
        }]}>✦</Animated.Text>)}
      </View>}
      <Button onPress={revealed ? close : () => setRevealed(true)}>{revealed ? t.done : t.boxReveal}</Button>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 364 },
  text: { textAlign: 'center' },
  stage: { height: 176, borderRadius: 12, backgroundColor: '#231a2a', alignItems: 'center', justifyContent: 'center' },
  chest: { width: size, height: size },
  layer: { position: 'absolute', left: 0, top: 0, width: size, height: size / 2, overflow: 'hidden' },
  base: { top: size / 2 },
  art: { width: size, height: size },
  baseImage: { top: -size / 2 },
  spark: { position: 'absolute', fontSize: 22 },
  coin: { fontSize: 64, textAlign: 'center' },
});
