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

1. Bir Supabase projesi oluştur. Supabase CLI ile depoyu projeye bağla, `supabase db push` ile migration'ları uygula ve `supabase functions deploy library` ile Edge Function'ı dağıt.
2. E-posta girişini aç. Magic Link e-posta şablonunda uygulamanın kod girişine uygun `{{ .Token }}` değişkenini kullan. Apple ve Google sağlayıcılarını Supabase Auth ayarlarında etkinleştir, sağlayıcı panellerine Supabase OAuth callback adresini ve Supabase yönlendirme listesine `sanalkutuphane://auth` adresini ekle. Mobilde misafir girişi kapalıdır.
3. `mobile/.env.example` dosyasından `mobile/.env` oluştur. Proje URL'sini ve yalnızca istemciye dağıtılabilen publishable key'i gir. Service-role anahtarı Edge Function ortamında kalır. Function kullanıcıyı Supabase Auth ile doğrular. Jeton ve oturum yazımları RLS ile istemcilere kapalıdır.
4. Odaya özel görsel kullanmak için herkese açık `room-art` Storage bucket'ına `night.webp`, `garden.webp` veya `archive.webp` yükleyip `EXPO_PUBLIC_ROOM_ART_FROM_STORAGE=true` ayarla. Uygulamada paketli bir varsayılan sahne bulunur.

### Yerel geliştirme

```sh
cd mobile
npm ci
npm run typecheck
npm start
```

Android ve iOS development build oluşturmak için Expo'nun `npx expo run:android` veya `npx expo run:ios` komutunu kullan. iOS derlemesi macOS ve Xcode gerektirir. Yerel doğrulama hatırlatmaları kullanıcı bildirim iznini açtığında çalışır. Periyot tamamlandığında ödül bildirimi göndermek için gerçek cihazda EAS development build, EAS proje kimliği, APNs/FCM kimlik bilgileri ve Supabase Edge Function ortamında `EXPO_PUSH_ACCESS_TOKEN` gerekir.

İsteğe bağlı gözlemleme için örnek ortam dosyasında Sentry DSN ve PostHog alanları var. PostHog, kullanıcı ölçümü açtığında sınırlı sayıda akış olayı toplar. TR/EN aydınlatma metni uygulamada bulunur. Yayın öncesinde metni veri sorumlusu, iletişim bilgisi, işleme sebepleri, aktarımlar ve saklama süreleriyle tamamlayın. Hesap silme işlemi Supabase Auth hesabını ve uygulama kayıtlarını kaldırır.
