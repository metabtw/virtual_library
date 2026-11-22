# Sanal Kütüphane

Sanal Kütüphane, avatarla katılınan ortak odalarda odaklanmak için bir web ve Expo mobil uygulamasıdır. İki istemci aynı Supabase hesabını, odaları, envanteri ve jeton bakiyesini paylaşır.

## Önkoşullar ve Supabase

- Node.js 24 veya üzeri, npm ve çalışır durumda bir Supabase projesi gerekir.
- Depoyu ilk kez indiriyorsan `git clone https://github.com/metabtw/virtual_library.git` komutunu kullan. Depo zaten bilgisayarındaysa `git fetch origin`, `git switch main` ve `git pull --ff-only` komutları güncel sürümü getirir.
- Depodaki migration'lar ile `library`, `reward-worker` ve `ad-reward` Edge Function'larını ayrı bir Supabase test projesinde kur. E-posta girişi, yönlendirmeler, ödül zamanlayıcısı ve reklam ayarları için kurulum rehberlerini kullan. [Supabase kurulumu](docs/supabase-kurulum.md) · [Ödüllü reklam kurulumu](docs/odullu-reklam.md)
- Web için kökteki `.env.example`, mobil için `mobile/.env.example` dosyasını kendi klasöründe `.env.local` olarak kopyala. Windows PowerShell’de `Copy-Item .env.example .env.local` kullanabilirsin. İki dosyada da aynı projenin `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` değerlerini kullan. Bu dosyalara yalnızca istemciye açık değerler girilir.
- **Giriş e-postası gönder** düğmesine bas. Varsayılan bağlantıyı isteği yaptığın tarayıcıda aç veya kod şablonu etkinse tek kullanımlık kodu uygulamada doğrula. Genel kullanıcılara e-posta teslim etmek ve kod şablonunu etkinleştirmek için Supabase'de özel SMTP gerekir. [E-posta şablonu ve SMTP kurulumu](docs/supabase-kurulum.md#e-postayla-giriş)

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
6. Üst çubuktan **EN** seç. Oda adını veya hedefi ara, mağaza ve envanterde bir kategori seç. Sandık ödülleri ayrı görünür ve koleksiyon tamamlandığında ücretli kutu kapanır.

`PORT` ile web portu değiştirilebilir. Varsayılan dışındaki port veya alan adı için gerçek giriş adresini ve `/account-deletion` yolunu Supabase Auth yönlendirme listesine ekle.

`npm run build:web` Vercel'de yayınlanacak statik dosyaları `dist/web` dizinine çıkarır. Git dalı, özel alan adı ve giriş yönlendirmelerinin ayarları yayın rehberinde yer alır. [Vercel yayın kurulumu](docs/yayin-kurulumu.md#vercel-yayını)

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
4. Profilde hatırlatmaları aç. Android 12 ve üzerinde **Hatırlatmaları tam zamanında göster** seçeneğinden sistem iznini ver. Çalışan bir periyotta cihazı kilitle. Doğrulama zamanı geldiğinde yerel bildirimi ve uygulamaya dönüşte sunucu saatinin yenilenmesini gerçek cihazda kontrol et.
5. Günlük çalışma kartını aç ve **Kartı paylaş** ile yerel paylaşım menüsünde PNG göründüğünü doğrula. EAS veya yerel geliştirme derlemesini gerçek cihazda kullan.

Ödül push bildirimleri için ayrıca EAS proje kimliği, APNs/FCM kimlik bilgileri ve Edge Function ortamında `EXPO_PUSH_ACCESS_TOKEN` gerekir. Yerel doğrulama bildirimi uygulamanın cihazda planladığı bir hatırlatmadır. [Bildirim ve ödül kurulumu](docs/supabase-kurulum.md#ödül-işini-zamanla)

## İki istemciyle kabul testi

Bu işlemleri deneme hesaplarıyla yap. Bir hesabın silinmesini içeren adım için ayrılmış bir test hesabı kullan.

| Akış | Beklenen sonuç |
| --- | --- |
| Yeni hesapla giriş yap ve ilk avatarı kaydet | Altı hazır karakterden birini seçip saç modelini, kıyafeti, renkleri ve sakalı değiştir. Görünüm kaydedilir ve ilk profilde 30 jeton bir kez verilir. |
| Aynı Supabase hesabını web ve mobilde aç | Ad, avatar, jeton ve envanter eşleşir. Bir istemcide yapılan satın alma diğerinde görünür. |
| İki hesapla aynı odaya katıl | Katılımcı sayısı, hedef etiketi ve Çalışıyor, Masada, Molada durumları güncellenir. Kendi masan ortadadır. Durum değişiminin diğer ekrana yansıması için hedef 2 saniyedir. Diğer hesaptan kahve veya alkış gönderince tepki alıcıya görünür. |
| Masada ve molada sahneyi kontrol et | Masada avatarın elleri açık defterde kalemle hareket eder. Bitkinin yaprakları salınır ve lambanın parlaklığı değişir. Evcil hayvan masa kenarındaki kendi alanında hareket eder veya dinlenir. Molada avatar ve yazı animasyonu kaybolur, eşyalar ve evcil hayvan görünmeye devam eder. |
| Özel süreyi beş dakika seç ve periyodu tamamla | Özel süre 5–180 dakika aralığını kabul eder. Beş dakika doğrulama gerektirmez ve tamamlanınca bir jeton verir. |
| 50 dakikalık periyodu başlat, mola ver ve geri dön | Mola sırasında kalan süre sabit kalır. Doğrulamayı 20. ve 40. odak dakikalarında açılan 30 saniyelik pencerede yap. Başarıyla tamamlandığında 10 jeton bir kez yazılır. |
| Doğrulama penceresini kaçır | Periyot geçersiz olur ve jeton artmaz. Kedi envanterdeyse küskün duruma geçer. |
| Mağazadan eşya ve evcil hayvan alıp envanterden kuşan | Tutar bir kez düşer. Yetersiz bakiye ve doğrudan sandık ödülü satın alma reddedilir. Işık, aksesuar ve dekor üç ayrı masaya bağlı yuvada görünür. Masa kenarında tek evcil hayvan bulunur. Aynı yuvaya yeni ürün kuşanınca önceki ürün envanterde kalır. |
| 10 jetona özel oda aç ve davet kodunu kullan | Oda davetsiz hesaba görünmez. Altı haneli kodla katılım çalışır. Oda kapasitesi dokuz kişidir. |
| Arkadaş koduyla hesap oluştur | Profilde beş karakterli kodu kopyala. Arkadaş ekleme alanı `SK-`, kayıt alanı `DV-` ile başlar. Kaydolurken kullanıcı ID’si kullanacaksan ön eki `SK-` olarak seç. Tam kodu yapıştırmak da çalışır. Yeni hesaba 5, kod sahibine 10 jeton eklenir. |
| Arkadaşını çalışmaya çağır | Davet gönderince aynı arkadaş için 60 saniyelik geri sayım görünür. Arkadaş katıldığında düğmenin yerinde **Odada** yazmalıdır. |
| Odadan ayrıl ve özel odayı yeniden aç | Odalar sekmesine basıp ayrılma onayını önce iptal et, sonra onayla. Boş kalan özel odaya 12 saat içinde tekrar girersen kapanma süresi sıfırlanır. Açık bir özel odan varken ikinci odayı oluşturamazsın. |
| Arka plana geç ve uygulamayı kapat | İkinci hesap aynı odadayken ilk hesabın sekmesini gizle veya mobil uygulamayı arka plana al. Masada geçici bir durum etiketi görünür. Web sekmesi kapanınca tarayıcı ayrılma isteği gönderir. Mobilde işletim sistemi işlemi sinyal vermeden kapattığında sunucudaki bağlantı süresi dolunca masa boşalır. Doğrulama penceresi geçerse **Uyuyakaldı** görünür. |
| Günlük görevleri tamamla | Doğrulanan günlük süre 30 dakikaya gelince 5, 60 dakikaya gelince ek 10 jeton otomatik yazılır. |
| Birlikte 100 oda dakikasına ulaş | Eşik anında odada kalanlara sandık verilir. Eşik öncesinde ayrılan hesap sandık almaz. |
| Gizem Kutusu ve Oda sandığını aç | Gizem Kutusu mağazada ürün kartı olarak görünür ve 50 jetona açılır. Reklam düğmesinin yanındaki Oda sandığı, kazanılmış bir sandığı ücretsiz açar. |
| Profilde çalışma hedefini düzenle | Çalışma hedefini aç, bir hedef yazıp kaydet, kapat ve yeniden aç. Son hedef formda ve avatarın yanında görünür. |
| Sıralamaya katıl ve çalışma kartını aç | Yalnızca doğrulanmış süre hesaba katılır. Sıralama isteğe bağlıdır. Günlük kartta avatar, dakika ve seri görünür. |
| Deneme hesabını sil | Mobilde **Hesabımı ve Verilerimi Sil** veya webde `/account-deletion` üzerinden hesabı doğrula. Silinen hesaba bağlı profil, envanter ve çalışma kayıtları kaldırılır. |

Kütüphane Ağacı her 100 doğrulanmış dakikada odada bulunan üyelere ücretsiz sandık verir. İlk eşikte **Odaya göre** arka planı kuzey ışıklarına dönüşür. 50 jetonluk Gizem Kutusu koleksiyonda bulunmayan bir nadir eşya verir. Koleksiyon tamamlandığında ücretsiz sandık 10 jeton verir ve ücretli kutu kapalıdır.

Çalışma daveti, gönderen odada kaldığı sürece 30 dakika içinde kullanılabilir. Kayıt kodu ilk profil oluşturulurken işlenir. Mağazadaki **Jeton nasıl kazanılır?** düğmesi çalışma, görev, kayıt daveti ve reklam ödüllerini gösterir. [Reklam kurulumu ve testi](docs/odullu-reklam.md)

Yağmur, şömine, kafe ve lo-fi döngüleri herkese açıktır. Uzay İstasyonu ve Orman Kulübesi paketleri mağazada 30'ar jetondur. Kedi her 50 doğrulanmış dakikada bir seviye ilerler. Günlük çalışma kartı ve haftalık sıralama gün ve hafta sınırlarında İstanbul saatini kullanır.

## Otomatik kontroller

Depo kökünde.

```sh
npm ci
npm test
npm run test:postgres
deno check --no-lock --node-modules-dir=none supabase/functions/library/index.ts supabase/functions/reward-worker/index.ts supabase/functions/ad-reward/index.ts
deno test --no-lock --node-modules-dir=none --allow-env=EXPO_PUSH_ACCESS_TOKEN supabase/functions/_shared/rewards_test.ts supabase/functions/_shared/ad_rewards_test.ts
```

- `npm test`, web sunucusunu, Supabase istemci sözleşmesini, sayaç sınırlarını ve ortak piksel animasyonunu kontrol eder.
- `npm run test:postgres`, migration'ları geçici bir Postgres veritabanına uygular. RLS ve istemci yetkilerini, oda kapasitesini, doğrulamayı, jeton ve sandık işlemlerini, kuşanmayı, tepkileri, sıralamayı ve hesap silmeyi sınar. Çalışırken canlı Supabase'e bağlanmaz.
- Deno kontrolleri Edge Function tiplerini ve bir test Expo yanıtıyla push bileti ile teslim sonucu akışını sınar.

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

`mobile/eas.json` geliştirme, önizleme ve mağaza profillerini içerir. Web barındırma, SMTP, sosyal giriş, EAS imzalama, bildirimler ve mağaza öncesi cihaz testi adımları yayın rehberinde yer alır. [Yayın kurulumu](docs/yayin-kurulumu.md) · [KVKK yayın notları](docs/kvkk-yayin-notlari.md)
