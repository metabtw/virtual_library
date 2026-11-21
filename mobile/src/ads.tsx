import { useRef, useState } from 'react';
import { Modal, Platform, ScrollView, Text, View } from 'react-native';
import { adCooldownSeconds } from '../../public/study-rewards';
import { openRewardedAd } from './api';
import type { Snapshot } from './model';
import { message, type Translation } from './strings';
import { Button, ui } from './ui';

let initialized: Promise<boolean> | undefined;

async function watchAd(platform: 'android' | 'ios') {
  const sdk = await import('react-native-google-mobile-ads');
  initialized ??= (async () => {
    const consent = await sdk.AdsConsent.gatherConsent();
    if (!consent.canRequestAds) return false;
    await sdk.default().initialize();
    return true;
  })();
  const allowed = await initialized.catch(() => false);
  if (!allowed) { initialized = undefined; throw Error('adUnavailable'); }
  const { attempt, unit } = await openRewardedAd(platform);
  const ad = sdk.RewardedAd.createForAdRequest(unit, {
    requestNonPersonalizedAdsOnly: true,
    serverSideVerificationOptions: { customData: attempt },
  });
  return new Promise<boolean>((resolve, reject) => {
    let earned = false;
    let settled = false;
    const listeners: (() => void)[] = [];
    const timeout = setTimeout(() => finish(Error('adUnavailable')), 30000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      for (const remove of listeners) remove();
      if (error) reject(error);
      else resolve(earned);
    }
    listeners.push(
      ad.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => {
        clearTimeout(timeout);
        void ad.show().catch(() => finish(Error('adUnavailable')));
      }),
      ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(sdk.AdEventType.CLOSED, () => finish()),
      ad.addAdEventListener(sdk.AdEventType.ERROR, () => finish(Error('adUnavailable'))),
    );
    ad.load();
  });
}

export function AdRewards({ snapshot, serverNow, pending, t, refresh }: {
  snapshot: Snapshot; serverNow: number; pending: boolean; t: Translation; refresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null;
  const available = platform !== null && Boolean(snapshot.adPlatforms?.[platform]);
  const seconds = adCooldownSeconds(snapshot.adRetryAt, serverNow);
  const wait = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  async function play() {
    if (busy.current || seconds) return;
    if (!platform || !available) { setNotice(t.adUnavailable); return; }
    busy.current = true;
    setLoading(true);
    setNotice('');
    try {
      if (await watchAd(platform)) setNotice(t.adPending);
    } catch (error) {
      setNotice(message(t, error));
    } finally {
      refresh();
      busy.current = false;
      setLoading(false);
    }
  }

  return <View style={ui.card}>
    <Button disabled={pending || loading || seconds > 0 || !available} onPress={() => void play()}>{loading ? t.adLoading : t.watchAd}</Button>
    {seconds > 0 ? <Text style={ui.small}>{t.adCooldown} · {wait}</Text>
      : !available && <Text style={ui.small}>{t.adUnavailable}</Text>}
    {!!notice && notice !== t.adUnavailable && <Text accessibilityLiveRegion="polite" style={ui.accent}>{notice}</Text>}
    <Button muted onPress={() => setDetails(true)}>{t.coinHelp}</Button>
    <Modal visible={details} transparent onRequestClose={() => setDetails(false)} accessibilityViewIsModal>
      <View style={ui.modal}><View style={[ui.card, { width: '100%', maxWidth: 450, maxHeight: '80%' }]}>
        <Text style={ui.heading}>{t.coinHelp}</Text>
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          {[t.coinWelcome, t.coinFocus, t.coinQuests, t.referralInfo, t.coinAds, t.chestGoalInfo, t.coinChest]
            .map(line => <Text key={line} style={ui.small}>{line}</Text>)}
        </ScrollView>
        <Button muted onPress={() => setDetails(false)}>{t.done}</Button>
      </View></View>
    </Modal>
  </View>;
}
