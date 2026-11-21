# Sanal Kütüphane

Avatarlı ortak çalışma odaları, web ve Expo mobil istemcileri. İki istemci aynı Supabase Auth hesabını ve `library` Edge Function'ını kullanır.

## Web

Node.js 24 veya üzeri gerekir. `.env.example` dosyasından `.env.local` oluşturup Supabase URL'sini ve publishable key'i gir. Mevcut bir `mobile/.env.local` dosyası da aynı değişkenler için kullanılabilir.

```sh
npm ci
npm start
```

Tarayıcıda `http://localhost:3000/` adresinden giriş yap. `PORT` ile sunucu portu değiştirilebilir. Supabase Auth yönlendirme listesine kullanılan web adresinin eklenmesi gerekir. Hesap silme ekranı `/account-deletion` adresindedir ve silinecek hesabın oturumuyla doğrulanır.

Web sunucusu yalnızca arayüzü ve Supabase bağlantısının istemciye açık ayarlarını sunar. Eski SQLite prototip profilleri, yeni Supabase hesaplarına otomatik olarak taşınmaz.

## Odak kuralları

- Odalar 9 kişiyle sınırlıdır. 25, 50 ve 90 dakikalık seçenekler ile 5–180 dakika arasında özel süre bulunur.
- Sayaç, sunucunun bitiş zamanına göre gösterilir. Molada kalan süre sabitlenir. İstemciler doğrulama açılışını `next_check_at`, kapanışını `check_until` alanından okur. Mobil istemci ön plana dönünce durumu yeniler.
- Yeni hesap bir defa 30 jeton alır. Geçerli her beş çalışma dakikası için bir jeton yazılır. Kaçırılan doğrulama periyodu geçersiz kılar. Bakiye, XP ve doğrulama yazımları sunucu işlemlerinde gerçekleşir.

## Expo mobil uygulama

`mobile/` iOS ve Android istemcisidir. Expo Router, React Native, TypeScript ve Skia kullanır. Sunucu verileri TanStack Query, görünüm tercihleri Zustand ile yönetilir.

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

## Çalışma kulüpleri

- **Ne çalışıyorsun?** Profilde isteğe bağlı tek satırlık hedef seçilir. Oda görünümünde adının altında gösterilir ve oda listesinden hedef metniyle arama yapılabilir.
- **Özel odalar** 10 jetona açılır ve en fazla 9 kişi alır. İlk katılım için altı rakamlı davet kodu gerekir. Davet kodu oda sahibinin ekranında gösterilir. Özel odalar yalnızca davetle daha önce erişim almış hesapların listesinde görünür.
- **Kütüphane Ağacı** yalnızca başarıyla tamamlanan periyotların dakikasını, periyodun başladığı odaya ekler. Her 500 dakikada o sırada odada bulunan üyelere bir sandık verilir. İlk eşiğin ardından kuzey ışıklı arka plan açılır.
- **Gizem Kutusu** 50 jetona koleksiyonda eksik olan bir nadir eşya verir. Oda sandıkları ücretsizdir. Nadir koleksiyon tamamlandığında ücretsiz sandık 10 jeton verir. Ücretli kutu koleksiyon tamamlandığında açılamaz.
- **Ambiyans** yağmur, şömine, kafe ve lo-fi döngülerini ayrı ayrı karıştırır. Uzay İstasyonu ve Orman Kulübesi paketleri 30'ar jetondur. Oda ekranı kapanınca ses durur. Döngüler özgün sentezdir ve `python scripts/make-ambience.py` ile yeniden üretilebilir.
- **Kedi** her 50 doğrulanmış dakika için bir seviye ilerler. Yarım bırakılan veya doğrulaması kaçırılan periyotta küser. Sonraki en az 50 dakikalık başarılı periyotta geliştirilen uyku görünümüne döner.

Ambiyans için `expo-audio` yerel modülü kullanılır. Daha eski bir development build kullanıyorsan uygulamayı tekrar derle.

### Mağaza ve oda görünümü

Mağazada kıyafet, saç, masa süsü ve ses paketi filtreleri bulunur. **Sandık ödülleri** bölümündeki eşyalar mağazadan tek tek satın alınamaz. Kazanılan ödüller envanterde kullanılır. Bir kıyafet, saç veya masa yuvasına yeni eşya kuşanıldığında önceki eşya envanterde kalır.

Oda ekranındaki **Oda arka planı** menüsünden Klasik Kütüphane, Yağmurlu Gece, Cam Sera ve Yıldız Gözlemevi seçilebilir. Seçim cihazda saklanır. **Odaya göre** görünüm odanın varsayılan manzarasını ve 500 dakika eşiğindeki kuzey ışıklarını gösterir.


### Masa tepkileri, çalışma kartı ve sıralama

Aynı odadaki bir masaya dokunarak kahve veya alkış gönderilebilir. Tepki yalnızca alıcıya görünür. Haftalık sıralamaya katılım isteğe bağlıdır. Hafta ve gün sınırları İstanbul saatine göre hesaplanır ve yalnızca doğrulanmış periyotlar sayılır.

Tamamlanan periyot sonrası veya profilden günlük çalışma kartı açılabilir. Kartta kullanıcının avatarı, günün doğrulanmış dakikası ve çalışma serisi yer alır. Mobilde PNG paylaşım menüsü, webde PNG indirme kullanılabilir.

### Mağaza derlemeleri

`mobile/eas.json` geliştirme, önizleme ve mağaza derleme profillerini içerir. EAS projesi bağlandıktan sonra `npx eas-cli build --profile production --platform all` ile mağaza paketleri oluşturulabilir. Google Play ve App Store gönderimleri mağaza hesabı ve imzalama bilgileri gerektirir. Google Play hesap silme bağlantısı için web uygulamasının yayımlandığı alan adındaki `/account-deletion` adresini kullan.

Mağaza ve karakter PNG'leri `node scripts/render-sprites.mjs` ile aynı piksel çizimlerinden yeniden üretilir. Kişiselleştirilebilir canlı avatarlar Skia ile katmanlı olarak çizilir.
