import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  bookColors, dropBook, gameIds, gameText, mergeIcons, newGlide, newMerge, newTower,
  slideMerge, tickGlide, tickTower, type Direction, type GameId,
} from '../../public/study-games';
import type { Locale, Translation } from './strings';
import { Button, ui } from './ui';

const arrows = { left: '←', up: '↑', down: '↓', right: '→' } as const;

export function Games({ locale, t }: { locale: Locale; t: Translation }) {
  const [selected, setSelected] = useState<GameId>('tower');
  const [round, setRound] = useState(0);
  const copy = gameText(locale);
  function choose(id: GameId) {
    setSelected(id);
    setRound(previous => previous + 1);
  }
  return <View style={styles.games}>
    <Text accessibilityRole="header" style={ui.heading}>{t.games}</Text>
    <View style={styles.choices}>{gameIds.map(id => <Pressable key={id} accessibilityRole="button"
      accessibilityState={{ selected: selected === id }} onPress={() => choose(id)}
      style={[styles.choice, selected === id && styles.selected]}>
      <Text style={selected === id ? ui.accent : ui.small}>{copy.titles[id]}</Text>
    </Pressable>)}</View>
    <View style={ui.card}>
      <View style={ui.row}>
        <Text style={[ui.heading, { flex: 1 }]}>{copy.titles[selected]}</Text>
        <Button compact muted onPress={() => choose(selected)}>{copy.restart}</Button>
      </View>
      <Text style={ui.small}>{copy.help[selected]}</Text>
      {selected === 'tower' ? <Tower key={round} copy={copy} />
        : selected === 'merge' ? <MergeBoard key={round} copy={copy} />
        : <Glide key={round} copy={copy} />}
    </View>
  </View>;
}

type Copy = ReturnType<typeof gameText>;

function useGameLoop(step: (seconds: number) => void, enabled: boolean) {
  const latest = useRef(step);
  latest.current = step;
  useEffect(() => {
    if (!enabled) return;
    let frame: number;
    let last: number | undefined;
    function loop(time: number) {
      latest.current(Math.min((time - (last ?? time)) / 1000, 0.04));
      last = time;
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
}

function Tower({ copy }: { copy: Copy }) {
  const [tower, setTower] = useState(newTower);
  useGameLoop(seconds => setTower(previous => tickTower(previous, seconds)), !tower.done);
  const books = tower.books.slice(-9);
  const drop = () => setTower(dropBook);
  return <>
    <Text style={ui.accent}>{copy.books} · {tower.books.length - 1}{tower.done && ' · ' + copy.ended}</Text>
    <Pressable style={styles.arena} onPress={drop} accessibilityRole="button" accessibilityLabel={copy.drop} disabled={tower.done}>
      {books.map((book, index) => <View key={index} style={[styles.book, {
        left: `${book.x}%`, width: `${book.width}%`, bottom: `${8 + 7.5 * index}%`,
        backgroundColor: bookColors[(tower.books.length - books.length + index) % bookColors.length],
      }]} />)}
      {!tower.done && <View style={[styles.book, {
        left: `${tower.x}%`, width: `${tower.width}%`, top: '5%', backgroundColor: bookColors[tower.books.length % bookColors.length],
      }]} />}
    </Pressable>
    <Button disabled={tower.done} onPress={drop}>{copy.drop}</Button>
  </>;
}

function MergeBoard({ copy }: { copy: Copy }) {
  const [game, setGame] = useState(newMerge);
  function move(direction: Direction) {
    setGame(previous => slideMerge(previous, direction));
  }
  const [gesture] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.max(Math.abs(dx), Math.abs(dy)) > 12,
    onPanResponderRelease: (_, { dx, dy }) => {
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 20) move(Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    },
  }));
  return <>
    <Text style={ui.accent}>{copy.score} · {game.score}{game.done && ' · ' + copy.ended}</Text>
    <View style={[styles.arena, styles.grid]} {...gesture.panHandlers}>
      {Array.from({ length: 4 }, (_, row) => <View key={row} style={styles.gridRow}>
        {game.board.slice(row * 4, row * 4 + 4).map((item, index) => {
          const level = Math.min(item, copy.items.length - 1);
          return <View key={index} style={[styles.tile, item > 0 && { backgroundColor: bookColors[(item - 1) % bookColors.length] }]}>
            {item > 0 && <><Text style={styles.tileIcon}>{mergeIcons[level]}</Text>
              <Text numberOfLines={2} adjustsFontSizeToFit style={styles.tileLabel}>{copy.items[level]}</Text></>}
          </View>;
        })}
      </View>)}
    </View>
    <View style={styles.choices}>{(Object.keys(arrows) as Direction[]).map(direction =>
      <View key={direction} style={{ flex: 1 }}>
        <Button muted disabled={game.done} accessibilityLabel={copy.directions[direction]} onPress={() => move(direction)}>{arrows[direction]}</Button>
      </View>)}</View>
  </>;
}

function Glide({ copy }: { copy: Copy }) {
  const [game, setGame] = useState(newGlide);
  const held = useRef(false);
  const done = game.hits >= 5;
  useGameLoop(seconds => setGame(previous => tickGlide(previous, held.current, seconds)), game.active && !done);
  function lift() {
    held.current = true;
    setGame(previous => previous.active ? previous : { ...previous, active: true });
  }
  const lower = () => { held.current = false; };
  return <>
    <Text style={ui.accent}>{copy.score} · {game.score} / {copy.hits} · {game.hits}/5{done && ' · ' + copy.ended}</Text>
    <Pressable accessible={false} style={styles.arena} onPressIn={lift} onPressOut={lower} disabled={done}>
      {game.gates.map((gate, index) => <View key={index} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.shelf, { left: `${gate.x}%`, top: 0, height: `${gate.gap - 17}%` }]} />
        <View style={[styles.shelf, { left: `${gate.x}%`, top: `${gate.gap + 17}%`, bottom: 0 }]} />
        {!gate.collected && <View style={[styles.orb, { left: `${gate.x + 3}%`, top: `${gate.gap}%` }]} />}
      </View>)}
      <Text style={[styles.plane, { top: `${game.y}%`, transform: [{ rotate: `${game.velocity / 2}deg` }] }]}>➤</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: done }}
      style={[styles.choice, styles.lift, done && { opacity: .5 }]} disabled={done} onPressIn={lift} onPressOut={lower}
      onAccessibilityAction={() => { lift(); setTimeout(lower, 350); }}
      accessibilityActions={[{ name: 'activate' }]}>
      <Text style={ui.accent}>{game.active ? copy.lift : copy.start}</Text>
    </Pressable>
  </>;
}

const styles = StyleSheet.create({
  games: { gap: 12 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 1, borderColor: '#674958', borderRadius: 10, minHeight: 44, paddingHorizontal: 8,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#2a1c2a' },
  selected: { borderColor: '#f1b078' },
  arena: { height: 238, borderWidth: 1, borderColor: '#674958', borderRadius: 10, backgroundColor: '#2b2340', overflow: 'hidden' },
  book: { position: 'absolute', height: '6%', borderWidth: 2, borderColor: '#342433', borderRadius: 3 },
  grid: { maxWidth: 344, width: '100%', height: undefined, aspectRatio: 1, alignSelf: 'center', padding: 6, gap: 5 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 5 },
  tile: { flex: 1, backgroundColor: '#3b3049', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  tileIcon: { fontSize: 23, fontWeight: '700', color: '#201724' },
  tileLabel: { fontSize: 9, fontWeight: '600', color: '#201724', textAlign: 'center' },
  shelf: { position: 'absolute', width: '6%', borderWidth: 2, borderColor: '#995e56', backgroundColor: '#643644' },
  orb: { position: 'absolute', width: 11, height: 11, margin: -5, backgroundColor: '#ffdd89', borderRadius: 6 },
  plane: { position: 'absolute', left: '17%', color: '#ffddad', fontSize: 26, lineHeight: 26, marginTop: -13, fontWeight: 'bold' },
  lift: { borderColor: '#ad755d' },
});
