import { useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { boxLabels, boxOdds, canBuyFromShop } from '../../public/study-rewards';
import { chestAssets, itemAssets } from './asset-art';
import type { BoxTier, Item, ItemId, ItemKind, Snapshot } from './model';
import type { Locale, Translation } from './strings';
import { Button, Disclosure, Options, ui } from './ui';

type Category = 'all' | ItemKind;

const categoryLabels = {
  all: 'catalogAll', wearable: 'catalogClothes', hair: 'catalogHair',
  desk: 'catalogDesk', pet: 'catalogPets', ambience: 'catalogSound', rare: 'catalogChests',
} as const satisfies Record<Category, keyof Translation>;

const swatches: Record<ItemKind, { surface: string; trim: string }> = {
  desk: { surface: '#312b36', trim: '#b88770' },
  wearable: { surface: '#3b2937', trim: '#e3a695' },
  hair: { surface: '#302e49', trim: '#a9afe6' },
  pet: { surface: '#432d3b', trim: '#e1a7bd' },
  ambience: { surface: '#21383a', trim: '#9fd5ba' },
  rare: { surface: '#392d4e', trim: '#dfb9f8' },
};

export function ItemIllustration({ item }: { item: Item }) {
  const palette = swatches[item.kind] ?? swatches.desk;
  const asset = itemAssets[item.id];
  return <View accessible={false} style={[styles.art, {
    backgroundColor: palette.surface, borderColor: palette.trim + '66',
  }]}>
    {asset ? <Image source={asset} style={item.kind === 'hair' || item.kind === 'wearable' ? styles.skin : styles.prop}
      resizeMode="contain" accessible={false} fadeDuration={0} />
      : <Text style={styles.soundIcon}>✦</Text>}
  </View>;
}

type GalleryProps = {
  items: Item[];
  inventory: boolean;
  owned: Map<ItemId, boolean>;
  snapshot: Snapshot;
  t: Translation;
  locale: Locale;
  pending: boolean;
  action: (item: ItemId) => void;
};

const boxPalettes = {
  basic: { backgroundColor: '#463129', borderColor: '#98654f' },
  epic: { backgroundColor: '#473256', borderColor: '#a075c1' },
  legendary: { backgroundColor: '#544022', borderColor: '#c49954' },
};

function Boxes({ snapshot, owned, locale, t, pending, openBox }: Pick<GalleryProps, 'snapshot' | 'owned' | 'locale' | 't' | 'pending'> & {
  openBox: (tier: BoxTier, price: number) => void;
}) {
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
  const items = new Map(snapshot.items.map(item => [item.id, item]));
  return <>
    <Text style={styles.rewardTitle}>{t.catalogChests}</Text>
    <Text style={ui.small}>{t.boxRules}</Text>
    {(snapshot.boxes ?? []).map(box => {
      const odds = boxOdds(box.rewards, owned);
      const available = odds.some(reward => reward.chance > 0);
      const boxName = t[boxLabels[box.id]];
      const price = `${box.price} ${t.boxOpen}`;
      return <View key={box.id} style={[ui.card, boxPalettes[box.id]]}>
        <View style={styles.boxHeader}>
          <Image source={chestAssets[box.id]} style={styles.boxIcon} resizeMode="contain" accessible={false} />
          <Text accessibilityRole="header" style={[styles.name, { flexShrink: 1 }]}>{boxName}</Text>
        </View>
        <Disclosure title={t.boxOdds} hint={`${odds.length} ${t.prizeOptions}`}>
          {odds.map(reward => {
            const item = items.get(reward.item);
            return <View key={reward.item} style={styles.boxOdds}>
              <Image source={itemAssets[reward.item]} style={styles.prizeIcon} resizeMode="contain" accessible={false} />
              <Text style={[ui.ink, { flex: 1 }]}>{item ? locale === 'tr' ? item.name : item.name_en : reward.item}</Text>
              <Text style={ui.accent}>{reward.chance ? percent.format(reward.chance) : t.owned}</Text>
            </View>;
          })}
        </Disclosure>
        <Button accessibilityLabel={`${boxName} · ${price}`} disabled={pending || !available || (snapshot.profile?.coins ?? 0) < box.price}
          onPress={() => openBox(box.id, box.price)}>{available ? price : t.collectionComplete}</Button>
      </View>;
    })}
  </>;
}

function ItemGrid({ items, inventory, owned, snapshot, t, locale, pending, action }: GalleryProps) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350 || fontScale >= 1.35;
  const coins = snapshot.profile?.coins ?? 0;
  return <View style={styles.grid}>
    {items.map(item => {
      const hasItem = owned.has(item.id);
      const equipped = owned.get(item.id) === true;
      const chestOnly = !canBuyFromShop(item);
      const audio = item.kind === 'ambience';
      const wearable = item.kind === 'wearable' || item.kind === 'hair';
      const name = locale === 'tr' ? item.name : item.name_en;
      const afford = coins >= item.price;
      return <View key={item.id} style={[styles.tile, compact && styles.full, chestOnly && styles.rare,
        equipped && styles.equipped]}>
        <ItemIllustration item={item} />
        <View style={styles.details}>
          <Text style={styles.name}>{name}</Text>
          {chestOnly ? <Text style={styles.rewardLabel}>{t.chestReward}</Text>
            : <Text style={ui.small}>{t[categoryLabels[item.kind] ?? 'catalogDesk']}</Text>}
          {equipped && <Text style={styles.equippedLabel}>✓ {t.catalogEquipped}</Text>}
          {inventory && item.id === 'cat' && <Text style={ui.small}>
            {t.petName} {1 + (snapshot.pet?.xp ?? 0)} · {snapshot.pet?.upset ? t.petUpset : t.petHappy}
          </Text>}
        </View>
        {inventory && audio ? <Text style={ui.small}>{t.owned}</Text>
          : <Button muted={inventory || hasItem || !afford}
              accessibilityLabel={`${name} · ${inventory ? equipped ? t.remove : wearable ? t.catalogWear : t.use
                : hasItem ? t.owned : item.price + ' ' + t.coins}`}
              disabled={pending || (!inventory && (hasItem || !afford))} onPress={() => action(item.id)}>
              {inventory ? equipped ? t.remove : wearable ? t.catalogWear : t.use
                : hasItem ? t.owned : `${item.price} ${t.coins}`}
            </Button>}
      </View>;
    })}
  </View>;
}

export function Catalog({ snapshot, inventory, locale, t, pending, action, openBox }: {
  snapshot: Snapshot;
  inventory?: boolean;
  locale: Locale;
  t: Translation;
  pending: boolean;
  action: (item: ItemId) => void;
  openBox?: (tier: BoxTier, price: number) => void;
}) {
  const [category, setCategory] = useState<Category>('all');
  const owned = new Map(snapshot.inventory.map(entry => [entry.item, entry.placed]));
  const choices = snapshot.items.filter(item => inventory ? owned.has(item.id) : canBuyFromShop(item));
  const visible = category === 'all' ? choices : choices.filter(item => item.kind === category);
  const box = !inventory && (category === 'all' || category === 'rare') && snapshot.boxes?.length ? openBox : undefined;
  const grid = { inventory: !!inventory, owned, snapshot, t, locale, pending, action };

  return <>
    {inventory && <><Text style={ui.heading}>{t.inventory}</Text><Text style={ui.small}>{t.equipmentLimit}</Text></>}
    <Options<Category> label={t.catalogFilter} value={category}
      values={(Object.keys(categoryLabels) as Category[]).map(value => [value, t[categoryLabels[value]]])}
      onChange={setCategory} />
    {!visible.length && !box && <Text style={ui.small}>{inventory && !choices.length ? t.emptyInventory : t.catalogEmpty}</Text>}
    {box && <Boxes {...grid} openBox={box} />}
    {!!visible.length && <ItemGrid {...grid} items={visible} />}
  </>;
}

const styles = StyleSheet.create({
  boxHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  boxIcon: { width: 60, height: 60 },
  boxOdds: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prizeIcon: { width: 26, height: 26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '48%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: '#684c5c',
    backgroundColor: '#2c2230', padding: 8, gap: 8, minWidth: 0 },
  full: { flexBasis: '100%' },
  rare: { backgroundColor: '#2f253e', borderColor: '#8f6ba8' },
  equipped: { borderColor: '#88b693' },
  art: { minHeight: 108, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  prop: { width: 96, maxWidth: '100%', height: 96 },
  skin: { width: 62, height: 96 },
  details: { flexGrow: 1, gap: 4, paddingHorizontal: 2 },
  name: { color: '#fff0dc', fontSize: 14, fontWeight: '700' },
  soundIcon: { fontSize: 34, color: '#e7d9b1' },
  rewardTitle: { fontSize: 18, fontWeight: '700', color: '#efd6ff' },
  rewardLabel: { color: '#e5bdfb', fontWeight: '600', fontSize: 12 },
  equippedLabel: { color: '#b9ecba', fontSize: 12, fontWeight: '700' },
});
