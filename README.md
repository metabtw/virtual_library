# Sanal Kütüphane

Avatarlı ortak çalışma odaları için ilk oynanabilir web sürümü.

## Çalıştırma

Node.js 24 veya üzeri gerekir. Harici paket kurulumu gerekmez.

Windows'ta Node.js 20 kullanıyorsan [Node.js 24 LTS](https://nodejs.org/en/download) sürümünü kur. Yeni bir PowerShell penceresi açıp proje klasöründe `node -v` komutuyla sürümü kontrol et. Hâlâ eski sürüm görünüyorsa `where.exe node` ile PowerShell'in hangi kurulumu kullandığını kontrol et.

```sh
npm start
```

Tarayıcıdan `http://localhost:3000` adresini aç. Ayrı kullanıcıları denemek için farklı tarayıcı profilleri kullan.

`PORT` ve `LIBRARY_DB` ortam değişkenleriyle bağlantı noktası ve SQLite dosyası ayarlanabilir. Varsayılan veritabanı `.data/library.sqlite` dosyasıdır.

## Kurallar

- Profil tarayıcıya HTTP-only çerezle bağlanır. İlk sürümde harici hesap sağlayıcısı bulunmaz.
- Odalar 9 kişiyle sınırlıdır. İstemciler aktif odanın durumunu saniyede bir yeniler. 15 saniye bağlantı kurmayan üyelerin masası boşalır.
- 25, 50 ve 90 dakikalık hazır periyotlar ile 5–180 dakika arasında özel periyot kullanılabilir. Başlangıç, bitiş ve doğrulama pencereleri sunucunun saatine göre hesaplanır. Periyot bitiminden önceki her 20. dakikada 30 saniyelik doğrulama açılır.
- Yeni profiller bir defaya mahsus 30 jetonla başlar.
- Molaya geçince odak sayacı durur, çalışmaya dönünce kaldığı yerden devam eder. Açılmış doğrulama penceresi 30 saniye sonunda kapanır. Çalışma sırasında yalnızca mola ve doğrulama kontrolleri kullanılabilir.
- Sunucu tamamlanan her beş dakika için bir jeton verir. Harcamalar ve ödüller SQLite işlemleriyle kaydedilir.
- Bu web prototipi Node.js ve SQLite kullanır. Hesaplı giriş ve Supabase destekli Skia sahnesi mobil istemcidedir.

## Doğrulama

```sh
npm test
```

## Expo mobil uygulama

`mobile/` iOS ve Android istemcisidir. Expo Router, React Native, TypeScript ve Skia kullanır. Oturum, oda ve envanter verileri TanStack Query ile, görünüm tercihleri Zustand ile yönetilir. Web önizlemesi `npm start` komutuyla ayrı çalışır ve yerel SQLite verisini kullanır. Web prototipindeki profiller, Expo uygulamasındaki Supabase hesabına taşınmaz.

### Supabase

[Adım adım Supabase, e-posta, Google ve Apple giriş rehberi](docs/supabase-kurulum.md) proje bağlantısını, migration'ları, Edge Function dağıtımını ve zamanlanmış ödül işini kapsar. E-postayla gelen bağlantı temel giriş yoludur. Kod şablonu yapılandırıldığında doğrulama kodu da kullanılabilir. Sosyal giriş düğmeleri sağlayıcılar hazır olduğunda ortam değişkenleriyle açılır. Mobilde misafir girişi kapalıdır.

Odaya özel görsel kullanmak için herkese açık `room-art` Storage alanına `night.webp`, `garden.webp` veya `archive.webp` yükleyip `EXPO_PUBLIC_ROOM_ART_FROM_STORAGE=true` ayarla. Uygulamada paketli bir varsayılan sahne bulunur.

### Yerel geliştirme

```sh
cd mobile
npm ci
npm run typecheck
npm start
```

Android ve iOS development build oluşturmak için Expo'nun `npx expo run:android` veya `npx expo run:ios` komutunu kullan. iOS derlemesi macOS ve Xcode gerektirir. Yerel doğrulama hatırlatmaları kullanıcı bildirim iznini açtığında çalışır. Uygulama kapalıyken periyodu sonuçlandırmak için [zamanlanmış ödül işini](docs/supabase-kurulum.md#ödül-işini-zamanla) etkinleştir. Ödül bildirimi göndermek için gerçek cihazda EAS development build, EAS proje kimliği, APNs/FCM kimlik bilgileri ve Supabase Edge Function ortamında `EXPO_PUSH_ACCESS_TOKEN` gerekir.

İsteğe bağlı gözlemleme için örnek ortam dosyasında Sentry DSN ve PostHog alanları var. PostHog, kullanıcı ölçümü açtığında sınırlı sayıda akış olayı toplar. TR/EN aydınlatma metni uygulamada bulunur. Yayın öncesinde metni [yayın bilgileriyle](docs/kvkk-yayin-notlari.md) tamamla. Hesap silme işlemi Supabase Auth hesabını ve uygulama kayıtlarını kaldırır.


## CI ve veritabanı kontrolü

`npm ci && npm run test:postgres` migration'ları yerel Postgres üzerinde doğrular. GitHub Actions ayrıca web testlerini, mobil TypeScript kontrolünü, iOS/Android paket üretimini ve Edge Function tip kontrolünü çalıştırır.

## Mobil çalışma kulüpleri

- **Ne çalışıyorsun?** Profilde isteğe bağlı tek satırlık hedef seçilir. Oda görünümünde adının altında gösterilir ve oda listesinden hedef metniyle arama yapılabilir.
- **Özel odalar** 10 jetona açılır ve en fazla 9 kişi alır. İlk katılım için altı rakamlı davet kodu gerekir. Davet kodu oda sahibinin ekranında gösterilir. Özel odalar yalnızca davetle daha önce erişim almış hesapların listesinde görünür.
- **Kütüphane Ağacı** yalnızca başarıyla tamamlanan periyotların dakikasını, periyodun başladığı odaya ekler. Her 500 dakikada o sırada odada bulunan üyelere bir sandık verilir. İlk eşiğin ardından kuzey ışıklı arka plan açılır.
- **Gizem Kutusu** 50 jetona koleksiyonda eksik olan bir nadir eşya verir. Oda sandıkları ücretsizdir. Nadir koleksiyon tamamlandığında ücretsiz sandık 10 jeton verir. Ücretli kutu koleksiyon tamamlandığında açılamaz.
- **Ambiyans** yağmur, şömine, kafe ve lo-fi döngülerini ayrı ayrı karıştırır. Uzay İstasyonu ve Orman Kulübesi paketleri 30'ar jetondur. Oda ekranı kapanınca ses durur. Döngüler özgün sentezdir ve `python scripts/make-ambience.py` ile yeniden üretilebilir.
- **Kedi** her 50 doğrulanmış dakika için bir seviye ilerler. Yarım bırakılan veya doğrulaması kaçırılan periyotta küser. Sonraki en az 50 dakikalık başarılı periyotta geliştirilen uyku görünümüne döner.

Ambiyans için `expo-audio` yerel modülü kullanılır. Daha eski bir development build kullanıyorsan uygulamayı tekrar derle.
