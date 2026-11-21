import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { itemAssets } from './asset-art';
import type { Item, ItemId, ItemKind, Snapshot } from './model';
import type { Locale, Translation } from './strings';
import { Button, Options, ui } from './ui';

type Category = 'all' | ItemKind;

const categoryLabels = {
  all: 'catalogAll', wearable: 'catalogClothes', hair: 'catalogHair',
  desk: 'catalogDesk', ambience: 'catalogSound', rare: 'catalogChests',
} as const satisfies Record<Category, keyof Translation>;

const swatches: Record<ItemKind, { surface: string; trim: string }> = {
  desk: { surface: '#312b36', trim: '#b88770' },
  wearable: { surface: '#3b2937', trim: '#e3a695' },
  hair: { surface: '#302e49', trim: '#a9afe6' },
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

function ItemGrid({ items, inventory, owned, snapshot, t, locale, pending, action }: GalleryProps) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350 || fontScale >= 1.35;
  return <View style={styles.grid}>
    {items.map(item => {
      const hasItem = owned.has(item.id);
      const equipped = owned.get(item.id) === true;
      const chestOnly = item.kind === 'rare' && !inventory;
      const audio = item.kind === 'ambience';
      const wearable = item.kind === 'wearable' || item.kind === 'hair';
      const name = locale === 'tr' ? item.name : item.name_en;
      const afford = (snapshot.profile?.coins ?? 0) >= item.price;
      return <View key={item.id} style={[styles.tile, compact && styles.full, item.kind === 'rare' && styles.rare,
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
        {chestOnly ? hasItem && <Text style={ui.small}>{t.owned}</Text>
          : inventory && audio ? <Text style={ui.small}>{t.owned}</Text>
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

export function Catalog({ snapshot, inventory, locale, t, pending, action, boxes }: {
  snapshot: Snapshot;
  inventory?: boolean;
  locale: Locale;
  t: Translation;
  pending: boolean;
  action: (item: ItemId) => void;
  boxes?: ReactNode;
}) {
  const [category, setCategory] = useState<Category>('all');
  const owned = new Map(snapshot.inventory.map(entry => [entry.item, entry.placed]));
  const choices = snapshot.items.filter(item => !inventory || owned.has(item.id));
  const visible = category === 'all' ? choices : choices.filter(item => item.kind === category);
  const regular = inventory ? visible : visible.filter(item => item.kind !== 'rare');
  const prizes = inventory ? [] : visible.filter(item => item.kind === 'rare');
  const grid = { inventory: !!inventory, owned, snapshot, t, locale, pending, action };

  return <>
    <Text style={ui.heading}>{inventory ? t.inventory : t.shop}</Text>
    <Options<Category> label={t.catalogFilter} value={category}
      values={(Object.keys(categoryLabels) as Category[]).map(value => [value, t[categoryLabels[value]]])}
      onChange={setCategory} />
    {!visible.length && <Text style={ui.small}>{inventory && !choices.length ? t.emptyInventory : t.catalogEmpty}</Text>}
    {!!regular.length && <ItemGrid {...grid} items={regular} />}
    {!!prizes.length && <>
      <View style={styles.rewardHeader}>
        <Text style={styles.rewardTitle}>{t.catalogChests}</Text>
        <Text style={ui.small}>{t.chestCollectionInfo}</Text>
      </View>
      <ItemGrid {...grid} items={prizes} />
    </>}
    {!inventory && (category === 'all' || category === 'rare') && boxes}
  </>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '48%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: '#684c5c',
    backgroundColor: '#2c2230', padding: 8, gap: 8, minWidth: 0 },
  full: { flexBasis: '100%' },
  rare: { backgroundColor: '#2f253e', borderColor: '#8f6ba8' },
  equipped: { borderColor: '#88b693' },
  art: { minHeight: 94, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  prop: { width: 70, height: 70 },
  skin: { width: 62, height: 80 },
  details: { flexGrow: 1, gap: 4, paddingHorizontal: 2 },
  name: { color: '#fff0dc', fontSize: 14, fontWeight: '700' },
  soundIcon: { fontSize: 34, color: '#e7d9b1' },
  rewardHeader: { borderLeftWidth: 3, borderLeftColor: '#d2a8ef', paddingLeft: 10, gap: 4, marginTop: 4 },
  rewardTitle: { fontSize: 18, fontWeight: '700', color: '#efd6ff' },
  rewardLabel: { color: '#e5bdfb', fontWeight: '600', fontSize: 12 },
  equippedLabel: { color: '#b9ecba', fontSize: 12, fontWeight: '700' },
});
