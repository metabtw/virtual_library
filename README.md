# Sanal Kütüphane

Sanal Kütüphane, avatarla katılınan ortak odalarda odaklanmak için bir web ve Expo mobil uygulamasıdır. İki istemci aynı Supabase hesabını, odaları, envanteri ve jeton bakiyesini paylaşır.

## Önkoşullar ve Supabase

- Node.js 24 veya üzeri, npm ve çalışır durumda bir Supabase projesi gerekir.
- Depoyu ilk kez indiriyorsan `git clone --branch sanal-kutuphane-mvp https://github.com/metabtw/virtual_library.git` komutunu kullan. Depo zaten bilgisayarındaysa `git fetch origin`, `git switch sanal-kutuphane-mvp` ve `git pull --ff-only` komutları güncel sürümü getirir.
- Depodaki migration'lar, `library` ve `reward-worker` Edge Function'ları ile ödül zamanlayıcısı test projesinde kurulmuş olmalı. E-posta bağlantısı, yönlendirme adresleri, isteğe bağlı Google ve Apple girişi ve zamanlayıcı ayarları için kurulum rehberini kullan. [Supabase kurulum rehberi](docs/supabase-kurulum.md)
- Web için kökteki `.env.example`, mobil için `mobile/.env.example` dosyasını kendi klasöründe `.env.local` olarak kopyala. Windows PowerShell’de `Copy-Item .env.example .env.local` kullanabilirsin. İki dosyada da aynı projenin `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` değerlerini kullan. Bu dosyalara yalnızca istemciye açık değerler girilir.
- E-posta bağlantısını giriş isteğini başlattığın tarayıcı profilinde veya mobil cihazda aç. Genel kullanıcılara e-posta göndermek için Supabase'de özel SMTP yapılandır. Kodla giriş, e-posta şablonunda kod etkin olduğunda kullanılabilir.

Tarayıcı ve Expo istemcisi `library` Edge Function'ına bağlanır. Sayaç kuralları, jetonlar, XP, oda kapasitesi ve sandık ödülleri Supabase tarafında yürütülür. Eski SQLite prototip profilleri yerel dosyada kalır.

## Web'i çalıştır ve test et

Depo kökünde çalıştır.

```sh
npm ci
npm start
```

1. `http://localhost:3000/` adresini aç ve Supabase hesabınla giriş yap. Kök dizinde yapılandırma yoksa web sunucusu `mobile/.env.local` dosyasını da okuyabilir.
2. İki kullanıcıyı bağımsız görmek için normal pencere ve gizli pencere ya da farklı tarayıcı profilleri kullan. Web ve mobil eşitlemesini kontrol etmek için önce aynı hesapla, oda etkileşimlerini kontrol etmek için iki ayrı hesapla giriş yap.
3. Tarayıcının cihaz araç çubuğunda **320, 390, 768 ve 1440 piksel** genişliklerde oda listesini, dolu odayı, mağazayı, profili ve doğrulama penceresini kontrol et. Uzun ad ve hedef metni, dokuz masa, kuşanılmış eşyalar ve açılır seçimler ekranda sığmalı.
4. İşletim sisteminde ya da tarayıcının geliştirici araçlarında `prefers-reduced-motion: reduce` aç. Oda sahnesinde açık defter ve eller tek pozda görünmeli. Eşyalar okunabilir boyutlarını korumalı.
5. Odaya katıl ve **Oda arka planı** bölümünde tema seç. Sayfayı yenilediğinde seçimin korunmalı. **Ambiyans mikseri** bölümünde iki sesi ayrı seviyelerde aç. Tarayıcı otomatik oynatmayı engellerse **Sesleri oynat** düğmesini kullan. Oda ekranından çıktığında sesler durmalı. Satın alınan ses paketleri mikserde seçilebilir olmalı.

`PORT` ile web portu değiştirilebilir. Varsayılan dışındaki port veya alan adı için gerçek giriş adresini ve `/account-deletion` yolunu Supabase Auth yönlendirme listesine ekle.

## Expo mobil uygulamasını çalıştır ve test et

Mobil istemci Expo Router, React Native, TypeScript ve Skia kullanır. Sunucu verileri TanStack Query, görünüm tercihleri Zustand ile yönetilir. Expo geliştirme derlemesi, Skia, ses, bildirim ve paylaşım modüllerini içerir. Android için Android Studio ve çalışan bir emülatör veya bağlı cihaz, iOS için macOS ve Xcode gerekir.

```sh
cd mobile
npm ci
npm run typecheck
```

İlk kurulumda veya yerel bir modül değiştiğinde hedef platform için geliştirme derlemesini oluştur.

```sh
npx expo run:android
# macOS üzerinde iOS için
npx expo run:ios
```

Derleme kurulduktan sonra JavaScript ve görsel değişikliklerini Metro ile çalıştır.

```sh
npm start -- --dev-client
```

1. Geliştirme derlemesini aç, Metro'ya bağlan ve web ile aynı Supabase projesinde oturum aç.
2. Dar bir telefon profili ve sistemde büyütülmüş yazıyla oda, mağaza, hedef alanı, hesaba giriş ve açılır pencereleri gez. Masadaki yazı hareketini kendi avatarında ve çevredeki katılımcılarda kontrol et. Android veya iOS'ta hareketi azaltma seçeneğini açıp durgun pozu da kontrol et.
3. Oda ekranında **Oda arka planı** seçimini değiştir, uygulamayı kapatıp tekrar aç. Seçilen manzara cihazda korunmalı. Ambiyans mikserinde iki sesi ayrı seviyelerde çal ve odadan çıkınca seslerin durduğunu dinle.
4. Profilde hatırlatmaları aç ve çalışan bir periyotta cihazı kilitle. Doğrulama zamanı geldiğinde yerel bildirimi ve uygulamaya dönüşte sunucu saatinin yenilenmesini gerçek cihazda kontrol et. Sistem izinleri ve güç tasarrufu bildirim teslimini etkileyebilir.
5. Günlük çalışma kartını aç ve **Kartı paylaş** ile yerel paylaşım menüsünde PNG göründüğünü doğrula. EAS veya yerel geliştirme derlemesini gerçek cihazda kullan.

Ödül push bildirimleri için ayrıca EAS proje kimliği, APNs/FCM kimlik bilgileri ve Edge Function ortamında `EXPO_PUSH_ACCESS_TOKEN` gerekir. Yerel doğrulama bildirimi uygulamanın cihazda planladığı bir hatırlatmadır. [Bildirim ve ödül kurulumu](docs/supabase-kurulum.md#ödül-işini-zamanla)

## İki istemciyle kabul testi

Bu işlemleri deneme hesaplarıyla yap. Bir hesabın silinmesini içeren adım için ayrılmış bir test hesabı kullan.

| Akış | Beklenen sonuç |
| --- | --- |
| Yeni hesapla giriş yap ve ilk avatarı kaydet | Altı hazır karakterden birini seçip saç modelini, kıyafeti, renkleri ve sakalı değiştir. Görünüm kaydedilir ve ilk profilde 30 jeton bir kez verilir. |
| Aynı Supabase hesabını web ve mobilde aç | Ad, avatar, jeton ve envanter eşleşir. Bir istemcide yapılan satın alma diğerinde görünür. |
| İki hesapla aynı odaya katıl | Oda sayısı, hedef etiketi ve Masada/Molada durumu güncellenir. Kendi masan ortadadır. Durum değişiminin diğer ekrana yansıması için hedef 2 saniyedir. Diğer hesaptan kahve veya alkış gönderince tepki alıcıya görünür. |
| Masada ve molada sahneyi kontrol et | Masada avatarın elleri açık defterde kalemle hareket eder. Bitkinin yaprakları salınır ve lambanın parlaklığı değişir. Evcil hayvan masa kenarındaki kendi alanında hareket eder veya dinlenir. Molada avatar ve yazı animasyonu kaybolur, eşyalar ve evcil hayvan görünmeye devam eder. |
| Özel süreyi beş dakika seç ve periyodu tamamla | Özel süre 5–180 dakika aralığını kabul eder. Beş dakika doğrulama gerektirmez ve tamamlanınca bir jeton verir. |
| 50 dakikalık periyodu başlat, mola ver ve geri dön | Mola sırasında kalan süre sabit kalır. Doğrulamayı 20. ve 40. odak dakikalarında açılan 30 saniyelik pencerede yap. Başarıyla tamamlandığında 10 jeton bir kez yazılır. |
| Doğrulama penceresini kaçır | Periyot geçersiz olur ve jeton artmaz. Kedi envanterdeyse küskün duruma geçer. |
| Mağazadan eşya ve evcil hayvan alıp envanterden kuşan | Tutar bir kez düşer. Yetersiz bakiye ve doğrudan sandık ödülü satın alma reddedilir. Işık, aksesuar ve dekor üç ayrı masaya bağlı yuvada görünür. Masa kenarında tek evcil hayvan bulunur. Aynı yuvaya yeni ürün kuşanınca önceki ürün envanterde kalır. |
| 10 jetona özel oda aç ve davet kodunu kullan | Oda davetsiz hesaba görünmez. Altı haneli kodla katılım çalışır. Oda kapasitesi dokuz kişidir. |
| Sıralamaya katıl ve çalışma kartını aç | Yalnızca doğrulanmış süre hesaba katılır. Sıralama isteğe bağlıdır. Günlük kartta avatar, dakika ve seri görünür. |
| Deneme hesabını sil | Mobilde **Hesabımı ve Verilerimi Sil** veya webde `/account-deletion` üzerinden hesabı doğrula. Silinen hesaba bağlı profil, envanter ve çalışma kayıtları kaldırılır. |

Kütüphane Ağacı her 500 doğrulanmış dakikada odada bulunan üyelere ücretsiz sandık verir. İlk eşikte **Odaya göre** arka planı kuzey ışıklarına dönüşür. 50 jetonluk Gizem Kutusu koleksiyonda bulunmayan bir nadir eşya verir. Koleksiyon tamamlandığında ücretsiz sandık 10 jeton verir ve ücretli kutu kapalıdır. Bu uzun senaryoların süreleri yerel veritabanı testinde ilerletilir.

Yağmur, şömine, kafe ve lo-fi döngüleri herkese açıktır. Uzay İstasyonu ve Orman Kulübesi paketleri mağazada 30'ar jetondur. Kedi her 50 doğrulanmış dakikada bir seviye ilerler. Günlük çalışma kartı ve haftalık sıralama gün ve hafta sınırlarında İstanbul saatini kullanır.

## Otomatik kontroller

Depo kökünde.

```sh
npm ci
npm test
npm run test:postgres
deno check --no-lock --node-modules-dir=none supabase/functions/library/index.ts supabase/functions/reward-worker/index.ts
```

- `npm test`, web sunucusunu, Supabase istemci sözleşmesini, sayaç sınırlarını ve ortak piksel animasyonunu kontrol eder.
- `npm run test:postgres`, migration'ları geçici bir Postgres veritabanına uygular. RLS ve istemci yetkilerini, oda kapasitesini, doğrulamayı, jeton ve sandık işlemlerini, kuşanmayı, tepkileri, sıralamayı ve hesap silmeyi sınar. Çalışırken canlı Supabase'e bağlanmaz.
- Deno komutu Edge Function'ların tip kontrolüdür. Deno kurulu olmalı.

Mobil paket kontrolü.

```sh
cd mobile
npm ci
npm run typecheck
npx expo export --platform all --output-dir dist --max-workers 2
```

`expo export`, iOS ve Android için JavaScript paketlerini ve kaynaklarını doğrular. Yerel izinler, kilit ekranı bildirimleri ve paylaşım menüsü için geliştirme derlemesini cihazda açarak mobille ilgili kabul adımlarını uygula. GitHub Actions web, Postgres, Edge Function ve Expo paket kontrollerini çalıştırır.

## Görseller ve dağıtım

Avatarın yazı hareketi ve eşya çizimleri ortak piksel çiziminden üretilir. Mobil mağaza ve animasyon PNG'lerini depo kökünde `node scripts/render-sprites.mjs` ile yenile.

Web ve mobil aynı stereo ambiyans döngülerini kullanır. NumPy ve FFmpeg kurulu olduğunda `python scripts/make-ambience.py` kaynak kayıtları indirip döngüleri yeniden üretir. [Kayıt kaynakları](mobile/assets/ambience/SOURCES.md)

Oda arka planlarında Klasik Kütüphane, Yağmurlu Gece, Cam Sera ve Yıldız Gözlemevi bulunur. Odaya özel görseller için Supabase Storage'daki `room-art` alanına `night.webp`, `garden.webp` veya `archive.webp` ekleyip mobilde `EXPO_PUBLIC_ROOM_ART_FROM_STORAGE=true` ayarlanabilir.

`mobile/eas.json` geliştirme, önizleme ve mağaza profillerini içerir. EAS projesi ve imzalama bilgileri tanımlandığında `mobile/` klasöründen `npx eas-cli build --profile production --platform all` ile mağaza paketleri oluşturulabilir. Google Play hesap silme bağlantısı için yayımlanan web uygulamasının HTTPS adresindeki `/account-deletion` yolunu kullan.

Sentry ve PostHog isteğe bağlı çevre değişkenleriyle etkinleşir. Yayımlamadan önce TR ve EN aydınlatma metnini kendi veri sorumlusu ve saklama bilgilerinle tamamla. [KVKK yayın notları](docs/kvkk-yayin-notlari.md)
