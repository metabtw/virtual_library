alter table public.items drop constraint items_kind_check;
alter table public.items add constraint items_kind_check
  check (kind in ('desk', 'wearable', 'hair', 'ambience', 'rare'));
alter table public.items add column equip_slot text check (
  equip_slot in ('outfit', 'hair', 'light', 'table_accent', 'table_display')
);

update public.items set equip_slot = case
  when id = 'sweater' then 'outfit'
  when id in ('lamp', 'neon') then 'light'
  when id = 'plant' then 'table_display'
end
where id in ('sweater', 'lamp', 'neon', 'plant');

insert into public.items(id, name, name_en, price, kind, equip_slot) values
  ('auroraHood', 'Kuzey Işıkları Kapüşonlusu', 'Aurora Hoodie', 24, 'wearable', 'outfit'),
  ('archiveVest', 'Arşivci Yeleği', 'Archivist Vest', 20, 'wearable', 'outfit'),
  ('moonCoat', 'Ay Nakışlı Hırka', 'Moon Cardigan', 28, 'wearable', 'outfit'),
  ('copperCurls', 'Bakır Bukle', 'Copper Curls', 14, 'hair', 'hair'),
  ('silverBraid', 'Gümüş Örgü', 'Silver Braid', 18, 'hair', 'hair'),
  ('midnightFade', 'Gece Perçemi', 'Midnight Fringe', 12, 'hair', 'hair'),
  ('teaSet', 'Porselen Çay Seti', 'Porcelain Tea Set', 9, 'desk', 'table_accent'),
  ('hourglass', 'Kum Saati', 'Hourglass', 11, 'desk', 'table_accent'),
  ('miniGlobe', 'Minyatür Dünya', 'Miniature Globe', 16, 'desk', 'table_display'),
  ('crystalTerrarium', 'Kristal Teraryum', 'Crystal Terrarium', 22, 'desk', 'table_display');

-- Library mutations already serialize by user. Replacing an item in a slot
-- uses that same transaction, before the updated inventory is returned.
create function public.replace_equipped_item()
returns trigger language plpgsql set search_path = '' as $$
declare
  slot text;
begin
  select equip_slot into slot from public.items where id = new.item;
  if slot is not null then
    update public.user_items as owned
    set placed = false
    from public.items as item
    where owned.user_id = new.user_id and owned.item = item.id
      and item.id <> new.item and item.equip_slot = slot and owned.placed;
  end if;
  return new;
end;
$$;
revoke all on function public.replace_equipped_item() from public, anon, authenticated;

create trigger replace_equipped_item after insert or update of placed on public.user_items
  for each row when (new.placed)
  execute function public.replace_equipped_item();
