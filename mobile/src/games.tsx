import { memo, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, AppState, Image, PanResponder, Pressable, StyleSheet, Text, View,
  useWindowDimensions, type StyleProp, type ViewStyle,
} from 'react-native';
import { atlasColumns, atlasRows, createGameRound, gameArt, type GameFrame, type GameInput, type GameNode } from '../../public/game-scenes';
import { gameIds, gameText, type Direction, type GameId } from '../../public/study-games';
import type { Locale, Translation } from './strings';
import { roomThemes } from './themes';
import { Button, ui } from './ui';

const atlas = require('../../public/game-art.png');
export const gameImages: number[] = [atlas, roomThemes.classic.image, ...gameIds.map(id => roomThemes[gameArt[id].room].image)];

function GameBackground({ id }: { id: GameId }) {
  const [fallback, setFallback] = useState(false);
  const image = roomThemes[fallback ? 'classic' : gameArt[id].room].image;
  return <Image source={image} resizeMode="cover" accessible={false} style={styles.cover}
    onError={fallback ? undefined : () => setFallback(true)} />;
}
const arrows = { left: '←', up: '↑', down: '↓', right: '→' } as const;
const grid = Array.from({ length: 16 }, (_, index) => index);
type Copy = ReturnType<typeof gameText>;

export function Games({ locale, t }: { locale: Locale; t: Translation }) {
  const [selected, setSelected] = useState<GameId>('tower');
  const [round, setRound] = useState(0);
  const copy = gameText(locale);
  const restart = () => setRound(previous => previous + 1);
  const { width } = useWindowDimensions();
  return <View style={styles.games}>
    <Text accessibilityRole="header" style={ui.title}>{t.games}</Text>
    <View style={styles.choices}>{gameIds.map(id => {
      const art = gameArt[id];
      return <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: selected === id }}
        accessibilityLabel={copy.titles[id]} onPress={() => setSelected(id)}
        style={[styles.choice, selected === id && { borderColor: art.accent }]}>
        <GameBackground id={id} />
        <View style={styles.coverShade} />
        <View style={[styles.choiceIcon, { borderColor: art.edge }]}><Texture art={art.icon} /></View>
        <View style={styles.choiceCopy}>
          <Text style={styles.choiceTitle}>{copy.titles[id]}</Text>
          {width >= 590 && <Text style={ui.small}>{copy.chapters[id]}</Text>}
        </View>
      </Pressable>;
    })}</View>
    <GameConsole key={selected + '-' + round} id={selected} copy={copy} restart={restart} wide={width >= 760} />
  </View>;
}

const Texture = memo(function Texture({ art }: { art: number }) {
  return <View style={styles.texture} pointerEvents="none" accessible={false}>
    <Image source={atlas} accessible={false} resizeMode="stretch" fadeDuration={0} style={{
      position: 'absolute', width: `${atlasColumns * 100}%`, height: `${atlasRows * 100}%`,
      left: `${-100 * (art % atlasColumns)}%`, top: `${-100 * Math.floor(art / atlasColumns)}%`,
    }} />
  </View>;
});

function PixelPiece({ node, text }: { node: GameNode; text: string }) {
  const placement: ViewStyle = {
    left: `${node.x}%`, top: `${node.y}%`, width: `${node.width}%`, height: `${node.height}%`,
    opacity: node.opacity ?? 1, transform: [{ rotate: `${node.rotate ?? 0}deg` }, { scale: node.scale ?? 1 }],
  };
  if (!node.level) {
    return <View style={[styles.piece, placement]} accessible={false}><Texture art={node.art} /></View>;
  }
  return <View style={[styles.piece, styles.tile, placement, {
    backgroundColor: node.color, borderColor: node.glow ? '#ffe0ac' : '#c29990b8',
  }]}>
    <View style={styles.tileArt}><Texture art={node.art} /></View>
    <Text style={styles.tileLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.72}>{text}</Text>
  </View>;
}

function GameConsole({ id, copy, restart, wide }: { id: GameId; copy: Copy; restart: () => void; wide: boolean }) {
  const [round] = useState(() => createGameRound(id));
  const [snapshot, setSnapshot] = useState<GameFrame>(() => round.frame());
  const reduced = useRef(false);
  const [foreground, setForeground] = useState((AppState.currentState ?? 'active') === 'active');
  const accessibilityRelease = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const art = gameArt[id];
  const title = copy.titles[id];
  const actionLabel = id === 'tower' ? copy.drop : snapshot.active ? copy.lift : copy.start;

  useEffect(() => {
    let mounted = true;
    const updateMotion = (enabled: boolean) => {
      if (!mounted) return;
      reduced.current = enabled;
      setSnapshot(round.frame(enabled));
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(updateMotion).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', updateMotion);
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') round.input('release');
      setForeground(state === 'active');
    });
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
      clearTimeout(accessibilityRelease.current);
    };
  }, [round]);

  useEffect(() => {
    if (!foreground || snapshot.done) return;
    let frame: number;
    let last: number | undefined;
    function loop(time: number) {
      const changed = round.step(Math.min((time - (last ?? time)) / 1000, .04));
      last = time;
      if (changed) setSnapshot(round.frame(reduced.current));
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [foreground, round, snapshot.done]);

  function command(input: GameInput) {
    round.input(input);
    setSnapshot(round.frame(reduced.current));
  }

  const [gesture] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.max(Math.abs(dx), Math.abs(dy)) > 12,
    onPanResponderRelease: (_, { dx, dy }) => {
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 20) command(Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    },
  }));

  const arenaStyle: StyleProp<ViewStyle> = [
    styles.arena, wide && styles.wideArena, { borderColor: art.edge },
    id === 'merge' && styles.board,
  ];
  const scene = <>
    <View style={[styles.full, { left: '-3%', right: '-3%', transform: [{ translateX: (snapshot.shift ?? 0) * 5 }] }]}
      pointerEvents="none">
      <GameBackground id={id} />
      <View style={[styles.full, styles.shade, id === 'merge' && styles.boardShade]} />
    </View>
    {id === 'merge' && <View style={styles.full} pointerEvents="none">
      {grid.map(index => <View key={index} style={[styles.emptyCell, { left: `${6 + index % 4 * 22.5}%`, top: `${6 + Math.floor(index / 4) * 22.5}%` }]} />)}
    </View>}
    {snapshot.guide && <View pointerEvents="none" style={[styles.guide, {
      left: `${snapshot.guide.x}%`, top: `${snapshot.guide.y}%`,
      width: `${snapshot.guide.width}%`, height: `${snapshot.guide.height}%`,
      backgroundColor: snapshot.guide.aligned ? '#ffc87944' : '#ffc57b15',
      borderColor: snapshot.guide.aligned ? '#ffe2a4' : '#d49c69b8',
    }]} />}
    <View style={[styles.full, styles.world]} pointerEvents="none">
      {snapshot.nodes.map(node => <PixelPiece key={node.key} node={node} text={copy.items[Math.min(node.level ?? 0, copy.items.length - 1)]} />)}
    </View>
    {snapshot.notice && <Text pointerEvents="none" style={styles.precision}>{copy.aligned}</Text>}
    {snapshot.done && <View style={[styles.full, styles.result]}>
      <View style={[styles.resultNote, { borderColor: art.edge }]}>
        <View style={styles.resultIcon}><Texture art={art.icon} /></View>
        <Text accessibilityRole="header" style={styles.resultTitle}>{copy.ended}</Text>
        <Button onPress={restart}>{copy.restart}</Button>
      </View>
    </View>}
  </>;

  return <View style={[ui.card, styles.panel]}>
    <View style={ui.row}>
      <Text accessibilityRole="header" style={[ui.heading, { flex: 1 }]}>{title}</Text>
      <Button muted compact onPress={restart}>{copy.restart}</Button>
    </View>
    <View style={[styles.console, wide && styles.wideConsole]}>
      {id === 'merge' ? <View style={arenaStyle} {...gesture.panHandlers}>{scene}</View>
        : <Pressable style={arenaStyle} accessible={!snapshot.done && id === 'tower'}
            accessibilityRole={id === 'tower' ? 'button' : undefined} accessibilityLabel={id === 'tower' ? actionLabel : undefined}
            onPress={id === 'tower' ? () => command('drop') : undefined}
            onPressIn={id === 'glide' ? () => command('hold') : undefined}
            onPressOut={id === 'glide' ? () => command('release') : undefined}>{scene}</Pressable>}
      <View style={[styles.instructions, wide && styles.wideInstructions]}>
        <View style={styles.stats}>
          <View style={[styles.stat, { flex: 1 }]}>
            <Text style={ui.small}>{id === 'tower' ? copy.books : copy.score}</Text>
            <Text style={[styles.amount, { color: art.accent }]}>{snapshot.score}</Text>
          </View>
          {id === 'glide' && <View style={[styles.stat, styles.impact]}>
            <View style={ui.row}><Text style={ui.small}>{copy.hits}</Text>
              <Text style={[styles.hitCount, { color: art.accent }]}>{snapshot.hits}/5</Text></View>
            <View style={styles.health} accessible={false}>
              {[0, 1, 2, 3, 4].map(index =>
                <View key={index} style={[styles.healthLine, { backgroundColor: index < (snapshot.hits ?? 0) ? '#685265' : art.accent }]} />)}
            </View>
          </View>}
        </View>
        {id === 'tower' ? <Button disabled={snapshot.done} onPress={() => command('drop')}>{actionLabel}</Button>
          : id === 'merge' ? <View style={styles.directions}>
            {(Object.keys(arrows) as Direction[]).map(direction =>
              <View key={direction} style={{ flex: 1 }}>
                <Button muted disabled={snapshot.done} accessibilityLabel={copy.directions[direction]} onPress={() => command(direction)}>
                  {arrows[direction]}
                </Button>
              </View>)}
          </View> : <Pressable accessibilityRole="button" accessibilityState={{ disabled: snapshot.done }}
            style={[styles.lift, snapshot.done && { opacity: .55 }]} disabled={snapshot.done}
            onPressIn={() => command('hold')} onPressOut={() => command('release')}
            onAccessibilityAction={() => {
              clearTimeout(accessibilityRelease.current);
              command('hold');
              accessibilityRelease.current = setTimeout(() => command('release'), 350);
            }} accessibilityActions={[{ name: 'activate' }]}>
            <Text style={styles.liftText}>{actionLabel}</Text>
          </Pressable>}
        <Text style={styles.help}>{copy.help[id]}</Text>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  games: { gap: 12 },
  choices: { flexDirection: 'row', gap: 6 },
  choice: {
    flex: 1, minWidth: 0, minHeight: 79, gap: 4, borderRadius: 10, borderWidth: 1, borderColor: '#75535f',
    padding: 7, justifyContent: 'center', backgroundColor: '#291d2a', overflow: 'hidden',
  },
  cover: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#291b28b8' },
  choiceIcon: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, backgroundColor: '#301f30df' },
  choiceCopy: { minWidth: 0 },
  choiceTitle: { color: '#fff0df', fontSize: 11, fontWeight: '700' },
  panel: { gap: 12, padding: 10 },
  console: { gap: 12 },
  wideConsole: { flexDirection: 'row', alignItems: 'center' },
  arena: {
    width: '100%', aspectRatio: 1.32, alignSelf: 'center', backgroundColor: '#251b30',
    borderWidth: 1, borderRadius: 10, overflow: 'hidden',
  },
  wideArena: { flex: 1, aspectRatio: 1.56 },
  board: { width: '100%', maxWidth: 385, aspectRatio: 1 },
  full: StyleSheet.absoluteFillObject,
  shade: { backgroundColor: '#21162535' },
  boardShade: { backgroundColor: '#2b1a30ba' },
  texture: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  piece: { position: 'absolute' },
  guide: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed', borderRadius: 4 },
  precision: {
    position: 'absolute', zIndex: 2, right: '5%', top: '6%', paddingVertical: 3, paddingHorizontal: 7, borderWidth: 1,
    borderColor: '#c69168', borderRadius: 6, backgroundColor: '#2a1b2fe9', color: '#ffe0ad', fontSize: 11, fontWeight: '700',
  },
  emptyCell: {
    position: 'absolute', width: '20.5%', height: '20.5%', borderRadius: 5, borderWidth: 1,
    backgroundColor: '#221824be', borderColor: '#a471848c',
  },
  tile: { borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, gap: 1 },
  tileArt: { width: '61%', maxWidth: 44, aspectRatio: 1 },
  tileLabel: { flexShrink: 1, fontSize: 9, color: '#fff0dc', fontWeight: '600', textAlign: 'center' },
  world: { zIndex: 1 },
  result: { zIndex: 5, elevation: 5, backgroundColor: '#211726b8', justifyContent: 'center', alignItems: 'center' },
  resultNote: {
    gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderRadius: 10, backgroundColor: '#332439ed',
  },
  resultIcon: { width: 38, height: 38 },
  resultTitle: { color: '#ffe5c8', fontWeight: '700', fontSize: 14 },
  instructions: { gap: 8, minWidth: 0 },
  wideInstructions: { width: '30%', minWidth: 170 },
  stats: { flexDirection: 'row', gap: 6 },
  stat: {
    minHeight: 39, minWidth: 0, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row', gap: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#684650', backgroundColor: '#251b28', paddingHorizontal: 9, paddingVertical: 5,
  },
  amount: { fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700' },
  impact: { flex: 1, flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  hitCount: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  health: { flexDirection: 'row', gap: 3 },
  healthLine: { flex: 1, height: 3, borderRadius: 1 },
  help: { color: '#d8baaf', fontSize: 12, lineHeight: 16 },
  directions: { flexDirection: 'row', gap: 5 },
  lift: {
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, minHeight: 44, borderRadius: 9,
    backgroundColor: '#eda767', borderWidth: 1, borderColor: '#ffce98',
  },
  liftText: { color: '#2b1a20', fontWeight: '700', fontSize: 13 },
});
