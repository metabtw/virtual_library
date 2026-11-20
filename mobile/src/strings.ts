import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AmbienceTrack, Volume } from './model';

export type Locale = 'tr' | 'en';
type Page = 'rooms' | 'room' | 'shop' | 'profile';
type Preferences = {
  locale: Locale; page: Page; alerts: boolean; usage: boolean; duration: string; volumes: Partial<Record<AmbienceTrack, Volume>>;
  setLocale: (locale: Locale) => void; setPage: (page: Page) => void;
  setAlerts: (value: boolean) => void; setUsage: (value: boolean) => void;
  setDuration: (duration: string) => void;
  setVolume: (track: AmbienceTrack, level: Volume) => void;
};
export const usePreferences = create<Preferences>()(persist(set => ({
  locale: 'tr', page: 'rooms', alerts: false, usage: false, duration: '50', volumes: {},
  setLocale: locale => set({ locale }), setPage: page => set({ page }),
  setAlerts: alerts => set({ alerts }), setUsage: usage => set({ usage }),
  setDuration: duration => set({ duration }),
  setVolume: (track, level) => set(current => ({ volumes: { ...current.volumes, [track]: level } })),
}), {
  name: 'library-preferences-v1',
  skipHydration: true,
  storage: createJSONStorage(() => ({
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
    removeItem: SecureStore.deleteItemAsync,
  })),
  partialize: ({ locale, alerts, usage, duration, volumes }) => ({ locale, alerts, usage, duration, volumes }),
}));

const tr = {
  app: 'Sanal Kütüphane', rooms: 'Odalar', room: 'Oda', shop: 'Mağaza', profile: 'Profil',
  email: 'E-posta', code: 'E-posta kodu', sendCode: 'Giriş e-postası gönder', resend: 'Yeni giriş e-postası gönder',
  emailSent: 'Giriş için e-postandaki bağlantıyı aynı cihazda aç. E-posta bir kod içeriyorsa kodu da girebilirsin.',
  authLinkError: 'Bu giriş bağlantısı kullanılamadı. Aynı cihazda yeni bir giriş e-postası iste.', signIn: 'Giriş yap',
  apple: 'Apple ile giriş', google: 'Google ile giriş', signOut: 'Çıkış yap',
  privacy: 'Kişisel veri aydınlatması', privacyBody: 'Hesabınızı yönetmek için e-posta adresiniz ve giriş sağlayıcınız işlenir. Avatarınız, oda durumunuz, çalışma ve jeton geçmişiniz hizmeti sunmak için saklanır. Adınız, avatarınız ve oda durumunuz aynı odanın katılımcılarına görünür. Paylaştığınız çalışma hedefi odanın arama sonuçlarına eklenir. Bildirim ve kullanım ölçümü tercihe bağlıdır. Yapılandırılmışsa anonimleştirilmiş hata raporları hizmetin işletilmesi için kullanılır. Hesap silme işlemi profil ve ilişkili kayıtları kaldırır.',
  cancel: 'Vazgeç', deleteAccount: 'Hesabı sil', confirmDelete: 'Profilini, envanterini ve çalışma geçmişini kalıcı olarak silmek istiyor musun?',
  coins: 'jeton', newAvatar: 'Avatarını oluştur', editAvatar: 'Avatarı düzenle', inventory: 'Envanter',
  name: 'Kullanıcı adı', gender: 'Cinsiyet', female: 'Kadın', male: 'Erkek', unspecified: 'Belirtmek istemiyorum',
  hair: 'Saç', outfit: 'Kıyafet', sweater: 'Kazak', shirt: 'Tişört', cardigan: 'Hırka', color: 'Renk',
  cinnamon: 'Tarçın', sage: 'Adaçayı', midnight: 'Gece mavisi', coffee: 'Kahve',
  desk: 'Masada', break: 'Molada', you: 'Sen', empty: 'Boş masa', save: 'Kaydet', edit: 'Düzenle',
  join: 'Katıl', open: 'Odayı aç', leave: 'Odadan ayrıl', choose: 'Çalışmak için bir oda seç.',
  start: 'Çalışmaya başla', resume: 'Devam et', pause: 'Molaya geç', focus: 'Odak süresi', duration: '5–180 dakika',
  here: 'Buradayım', verify: 'Hâlâ masada mısın?', reward: 'Çalışma tamamlandı.', invalid: 'Bu periyot geçersiz sayıldı.',
  use: 'Kullan', remove: 'Çıkar', owned: 'Envanterinde', emptyInventory: 'Envanterin boş.',
  alerts: 'Hatırlatmalar ve ödül bildirimleri', usage: 'Anonim kullanım ölçümü', loading: 'Yükleniyor…', retry: 'Tekrar dene',
  missingConfig: 'Supabase bağlantısı tanımlanmalı.', server: 'Sunucuya bağlanılamadı.',
  invalidAvatar: 'Geçerli bir kullanıcı adı ve avatar seç.', invalidDuration: '5–180 dakika arasında tam sayı gir.',
  roomFull: 'Oda dolu.', roomMissing: 'Oda bulunamadı.', insufficientCoins: 'Yeterli jetonun yok.',
  working: 'Diğer işlemler için önce mola ver.', verificationClosed: 'Doğrulama penceresi kapandı.',
  target: 'Ne çalışıyorsun?', targetHint: 'Örn. Matematik Vize', searchTarget: 'Hedef veya oda ara', noRooms: 'Eşleşen açık oda yok.',
  privateRoom: 'Özel arkadaş odası', createRoom: '10 jetonla oda aç', roomName: 'Oda adı',
  inviteCode: '6 haneli davet kodu', joinCode: 'Kodla katıl', shareInvite: 'Davet kodunu paylaş',
  inviteRequired: 'Bu odaya davet koduyla katılabilirsin.', invalidInvite: 'Davet kodu geçersiz.',
  inviteLimited: 'Bir dakika sonra tekrar dene.', invalidRoomName: 'Oda adı 2–32 karakter olmalı.',
  invalidTarget: 'Hedef tek satır ve en fazla 48 karakter olmalı.', profileRequired: 'Önce avatarını oluştur.',
  commonGoal: 'Kütüphane Ağacı', groupMinutes: 'Doğrulanmış çalışma', goalReached: 'Kuzey ışıkları göründü!',
  chest: 'Oda sandığı', openChest: 'Sandığı aç', noChest: 'Açılacak sandık yok.',
  box: 'Gizem Kutusu', openBox: '50 jetona aç', boxRules: 'Her kutu koleksiyonunda olmayan bir nadir eşya verir.',
  collectionComplete: 'Nadir eşya koleksiyonun tamamlandı.', prize: 'Kutudan çıkan ödül', done: 'Tamam',
  ambience: 'Ambiyans mikseri', rain: 'Yağmur Sesi', fire: 'Şömine Çıtırtısı', cafe: 'Kafe Uğultusu', lofi: 'Lo-Fi Beat',
  space: 'Uzay İstasyonu', forest: 'Orman Kulübesi', audioLocked: 'Ses paketi mağazada', audioOff: 'Kapalı',
  audioLow: 'Düşük', audioMid: 'Orta', audioHigh: 'Yüksek',
  petName: 'Kedinin seviyesi', petHappy: 'Huzurlu', petUpset: 'Küskün',
  abandon: 'Periyodu bırak', abandonConfirm: 'Bu periyottan jeton kazanamayacaksın.', noSession: 'Açık periyot yok.',
  itemMissing: 'Bu eşya burada kullanılamıyor.',
  itemOwned: 'Bu eşya zaten sende.', accountDeletion: 'Hesap silinemedi.', authError: 'Giriş tamamlanamadı.',
};

const en: Record<keyof typeof tr, string> = {
  app: 'Virtual Library', rooms: 'Rooms', room: 'Room', shop: 'Shop', profile: 'Profile',
  email: 'Email', code: 'Email code', sendCode: 'Send sign-in email', resend: 'Send another sign-in email',
  emailSent: 'Open the link from your email on this device to sign in. If the email includes a code, you can also enter it below.',
  authLinkError: 'This sign-in link could not be used. Request another sign-in email on this device.', signIn: 'Sign in',
  apple: 'Sign in with Apple', google: 'Sign in with Google', signOut: 'Sign out',
  privacy: 'Privacy notice', privacyBody: 'We use your email address and sign-in provider to manage your account. Your avatar, room status, study and coin history are stored to provide the service. Your name, avatar and room status are visible to members in the same room. A study target you share appears in search for that room. Notifications and usage measurement are optional. When configured, de-identified error reports are used to maintain the service. Deleting your account removes your profile and related records.',
  cancel: 'Cancel', deleteAccount: 'Delete account', confirmDelete: 'Permanently delete your profile, inventory and study history?',
  coins: 'coins', newAvatar: 'Create your avatar', editAvatar: 'Edit avatar', inventory: 'Inventory',
  name: 'Display name', gender: 'Gender', female: 'Female', male: 'Male', unspecified: 'Prefer not to say',
  hair: 'Hair', outfit: 'Outfit', sweater: 'Sweater', shirt: 'T-shirt', cardigan: 'Cardigan', color: 'Color',
  cinnamon: 'Cinnamon', sage: 'Sage', midnight: 'Midnight blue', coffee: 'Coffee',
  desk: 'At desk', break: 'On break', you: 'You', empty: 'Empty desk', save: 'Save', edit: 'Edit',
  join: 'Join', open: 'Open room', leave: 'Leave room', choose: 'Choose a room to study in.',
  start: 'Start studying', resume: 'Resume', pause: 'Take a break', focus: 'Focus time', duration: '5–180 minutes',
  here: 'I’m here', verify: 'Still at your desk?', reward: 'Study period completed.', invalid: 'This session did not count.',
  use: 'Place', remove: 'Remove', owned: 'Owned', emptyInventory: 'Your inventory is empty.',
  alerts: 'Reminders and reward notifications', usage: 'Anonymous usage measurement', loading: 'Loading…', retry: 'Retry',
  missingConfig: 'Set the Supabase connection details.', server: 'Could not connect to the server.',
  invalidAvatar: 'Choose a valid name and avatar.', invalidDuration: 'Enter a whole number between 5 and 180.',
  roomFull: 'This room is full.', roomMissing: 'Room not found.', insufficientCoins: 'You do not have enough coins.',
  working: 'Take a break to use other features.', verificationClosed: 'The verification window has closed.',
  target: 'What are you studying?', targetHint: 'E.g. Maths midterm', searchTarget: 'Find a goal or room', noRooms: 'No matching open room.',
  privateRoom: 'Private study room', createRoom: 'Create for 10 coins', roomName: 'Room name',
  inviteCode: '6-digit invite code', joinCode: 'Join with code', shareInvite: 'Share invite code',
  inviteRequired: 'An invite code is required for this room.', invalidInvite: 'Invalid invite code.',
  inviteLimited: 'Try again in a minute.', invalidRoomName: 'Room names must be 2–32 characters.',
  invalidTarget: 'Use one line and no more than 48 characters.', profileRequired: 'Create your avatar first.',
  commonGoal: 'Library Tree', groupMinutes: 'Verified study time', goalReached: 'The northern lights are out!',
  chest: 'Room chest', openChest: 'Open chest', noChest: 'There is no chest to open.',
  box: 'Mystery Box', openBox: 'Open for 50 coins', boxRules: 'Each box contains a rare item you do not already own.',
  collectionComplete: 'You have collected every rare item.', prize: 'Your reward', done: 'Done',
  ambience: 'Ambience mixer', rain: 'Rain', fire: 'Crackling Fireplace', cafe: 'Café Chatter', lofi: 'Lo-Fi Beat',
  space: 'Space Station', forest: 'Forest Cabin', audioLocked: 'Get this sound pack in the shop', audioOff: 'Off',
  audioLow: 'Low', audioMid: 'Medium', audioHigh: 'High',
  petName: 'Cat level', petHappy: 'Content', petUpset: 'Sulking',
  abandon: 'End session', abandonConfirm: 'You will not earn coins for this session.', noSession: 'There is no active session.',
  itemMissing: 'This item cannot be used here.',
  itemOwned: 'You already own this item.', accountDeletion: 'Could not delete the account.', authError: 'Could not sign in.',
};

export const words = { tr, en };
export type Translation = typeof tr;
export function message(t: Translation, error: unknown) {
  return error instanceof Error && Object.hasOwn(t, error.message)
    ? t[error.message as keyof Translation]
    : t.server;
}
