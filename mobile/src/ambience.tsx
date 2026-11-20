import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { AmbienceTrack, ItemId, Volume } from './model';
import { usePreferences, type Translation } from './strings';
import { Options, ui } from './ui';

const sources: Record<AmbienceTrack, number> = {
  rain: require('../assets/ambience/rain.m4a'),
  fire: require('../assets/ambience/fire.m4a'),
  cafe: require('../assets/ambience/cafe.m4a'),
  lofi: require('../assets/ambience/lofi.m4a'),
  space: require('../assets/ambience/space.m4a'),
  forest: require('../assets/ambience/forest.m4a'),
};

const tracks = Object.keys(sources) as AmbienceTrack[];

function Loop({ track, level, audible }: { track: AmbienceTrack; level: Volume; audible: boolean }) {
  const player = useAudioPlayer(sources[track]);
  useEffect(() => {
    if (!audible || level === 0) {
      player.pause();
      return;
    }
    player.loop = true;
    player.volume = level * 0.16;
    player.play();
  }, [player, level, audible]);
  return null;
}

export function Ambience({ locked, inventory, t }: {
  locked: boolean; inventory: { item: ItemId }[]; t: Translation;
}) {
  const volumes = usePreferences(state => state.volumes);
  const setVolume = usePreferences(state => state.setVolume);
  const [ready, setReady] = useState(false);
  const allowed = (track: AmbienceTrack) => (track !== 'space' && track !== 'forest')
    || inventory.some(item => item.item === track);
  const levels: [Volume, string][] = [[0, t.audioOff], [1, t.audioLow], [2, t.audioMid], [3, t.audioHigh]];

  useEffect(() => {
    let mounted = true;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false })
      .then(() => { if (mounted) setReady(true); }, () => {});
    return () => { mounted = false; };
  }, []);

  return <>
    {tracks.filter(track => allowed(track) && (volumes[track] ?? 0) > 0)
      .map(track => <Loop key={track} track={track} level={volumes[track] ?? 0} audible={ready} />)}
    {!locked && <View style={ui.card}>
      <Text style={ui.heading}>♫ {t.ambience}</Text>
      {tracks.map(track => allowed(track)
        ? <Options key={track} label={t[track]} values={levels} value={volumes[track] ?? 0}
          onChange={level => setVolume(track, level)} />
        : <Text key={track} style={ui.small}>{t[track]} · {t.audioLocked}</Text>)}
    </View>}
  </>;
}
