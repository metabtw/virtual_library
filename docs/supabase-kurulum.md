# Supabase ve mobil giriş kurulumu

Sanal Kütüphane e-postaya gönderilen bağlantı veya tek kullanımlık kodla açılır. Google ve Apple girişleri kendi sağlayıcı ayarları hazır olduğunda etkinleştirilir.

## Supabase projesini bağla

Mevcut yayın projesinin referansı `cqvrxlttlyjjlibitrvh`. Sosyal ödüller dalını denemek için oluşturduğun test projesinin referansını kullan. Codex üzerinden kurulum için Supabase hesabında seçtiğin projeye erişimi olan bir [Access Token](https://supabase.com/dashboard/account/tokens) oluştur ve bunu `SUPABASE_ACCESS_TOKEN` adlı gizli alana kaydet.

Kendi bilgisayarından kurmak için depoda aşağıdaki komutları çalıştır. CLI, giriş için tarayıcıyı açabilir ve gerekirse veritabanı parolasını etkileşimli olarak isteyebilir.

```sh
npx supabase login
npx supabase link --project-ref TEST_PROJE_REF
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy library
npx supabase functions deploy reward-worker
npx supabase functions deploy ad-reward
```

Migration geçmişi beklenmedikse ya da kuru çalıştırma daha önce oluşturulmuş tablolar bildirirse değişiklik uygulamadan önce mevcut şemayı incele. Supabase proje URL'sini ve istemciye dağıtılabilen publishable key'i `mobile/.env.local` dosyasına yaz. `mobile/.env.example` alan adlarını gösterir. Sunucu anahtarları, OAuth sırları ve veritabanı parolası mobil ortama girilmez.

## E-postayla giriş

Varsayılan Supabase göndericisi giriş bağlantısı yollar. Bağlantıyı webde isteği yaptığın tarayıcıda veya mobilde isteği yaptığın cihazda aç. E-postada sayısal kod almak için SMTP ve şablon adımlarını tamamla.

1. Supabase Dashboard'da **Authentication → Sign In / Providers → Email** bölümünü aç ve e-posta sağlayıcısını etkinleştir. **Authentication → URL Configuration** yönlendirme listesine `sanalkutuphane://auth` ekle.
2. **Authentication → SMTP Settings** bölümünde özel SMTP’yi etkinleştir. Doğrulanmış gönderen adresini ve sağlayıcının sunucu, port, kullanıcı adı ve parola bilgilerini gir. Ücretsiz planda varsayılan gönderici organizasyon ekibiyle sınırlıdır ve Supabase bu ayarla özel şablon kaydına izin vermez.
3. **Authentication → Email Templates** bölümünde **Confirm signup** ve **Magic Link** için konuyu `Sanal Kütüphane · Giriş kodun` olarak ayarla ve HTML şablonunu içerik olarak kaydet. Supabase `{{ .Token }}` yer tutucusunu tek kullanımlık kodla doldurur. [Giriş kodu şablonu](../supabase/templates/sign-in-code.html)
4. Uygulamada **Giriş e-postası gönder** düğmesini kullan. Gelen kodu girip **Kodu doğrula** ile oturum aç. Yeni bir e-posta adresinde kayıt şablonu, var olan bir hesapta giriş şablonu kullanılır.

[Supabase e-posta OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [SMTP ayarları](https://supabase.com/docs/guides/auth/auth-smtp)

## Web yönlendirmesi

Web ve mobil aynı Supabase Auth ve Edge Function kurulumunu kullanır. **Authentication → URL Configuration** izin listesine yerel geliştirme için `http://localhost:3000/` ve `http://localhost:3000/account-deletion` adreslerini ekle. `127.0.0.1` veya farklı port kullanıyorsan o adresleri de ekle. Yayınlanan web uygulaması için HTTPS kök adresini ve hesap silme yolunu ayrıca kaydet.

## Google ile giriş

### Bağlı projede web girişi

Web, `cqvrxlttlyjjlibitrvh` projesiyle kullanıldığında `google-auth` dalındaki Firebase hesabı seçme penceresini açar. Supabase Google kimlik belirtecini doğrular ve uygulama oturumunu açar. Oda, envanter ve jetonlar aynı Supabase hesabına bağlı kalır. Firebase web yapılandırmasını ve Google Client ID'yi [google-web-config.json](../google-web-config.json) dosyasında görebilirsin.

Supabase Dashboard'da **Authentication → Sign In / Providers → Google** bölümünde bu Google Client ID kayıtlı olmalı. Firebase Authentication **Authorized domains** listesinde web uygulamasını açtığın adresin alan adı bulunmalı. `localhost` ve `127.0.0.1` yerel test içindir. Webde Google girişini gizlemek için kök `.env.local` dosyasında `WEB_AUTH_GOOGLE=false` kullan.

### Expo ve ayrı Supabase projeleri

1. Google Cloud Console'da OAuth izin ekranını yapılandır. Uygulama test modundaysa test kullanıcılarını ekle.
2. **Web application** tipinde bir OAuth istemcisi oluştur. **Authorized redirect URIs** alanına şu adresi ekle.

   ```text
   https://PROJE_REF.supabase.co/auth/v1/callback
   ```

3. Supabase **Authentication → Sign In / Providers → Google** bölümünde Google Client ID ve Client Secret değerlerini girip sağlayıcıyı etkinleştir. Supabase **Authentication → URL Configuration** yönlendirme listesine `sanalkutuphane://auth` ekle.
4. `mobile/.env.local` dosyasında `EXPO_PUBLIC_AUTH_GOOGLE=true` ayarla ve Expo'yu yeniden başlat. Android ve iOS development build üzerinde Google hesabıyla giriş yap.

Ayrı bir Supabase projesine bağlanan web sunucusunda Google OAuth girişini göstermek için kök `.env.local` dosyasında `WEB_AUTH_GOOGLE=true` ayarla.

Bağlı projeye Expo için ayrı bir OAuth istemcisi ekliyorsan, **Client IDs** alanına yeni web istemcisini ilk sırada, Firebase istemcisini virgülle ikinci sırada yaz. **Client Secret** alanına ilk istemcinin sırrını gir.

[Supabase Google kurulum rehberi](https://supabase.com/docs/guides/auth/social-login/auth-google)

## Apple ile giriş

1. Apple Developer hesabında **Sign in with Apple** özelliğini App ID için etkinleştir ve bu App ID'ye bağlı bir **Services ID** oluştur.
2. Services ID'nin **Domains and Subdomains** alanına `PROJE_REF.supabase.co`, **Return URLs** alanına `https://PROJE_REF.supabase.co/auth/v1/callback` gir. `PROJE_REF` yerine kişisel Supabase projenin referansını yaz.
3. Apple Developer'da **Sign in with Apple** anahtarını oluştur. Services ID, Team ID, Key ID ve özel anahtarla Apple için OAuth client secret üret. Services ID'yi ve client secret'ı Supabase **Authentication → Sign In / Providers → Apple** bölümüne kaydet. Apple OAuth client secret süresi dolmadan önce yenileme hatırlatması kur.
4. Supabase yönlendirme listesine `sanalkutuphane://auth` ekle, `mobile/.env.local` içinde `EXPO_PUBLIC_AUTH_APPLE=true` ayarla ve Expo'yu yeniden başlat. Gerçek cihazda tarayıcıdan uygulamaya dönüşü doğrula.

[Supabase Apple kurulum rehberi](https://supabase.com/docs/guides/auth/social-login/auth-apple)

## Ödül işini zamanla

1. Rastgele, en az 32 karakter uzunluğunda bir worker anahtarı oluştur. Supabase Edge Function sırlarına `REWARD_WORKER_SECRET` adıyla kaydet. Push teslimatı için ayrıca EAS/APNs/FCM kimlik bilgileri ve Edge Function sırlarında `EXPO_PUSH_ACCESS_TOKEN` kullanılır.
2. Supabase Vault'a iki kayıt ekle. `library_reward_worker_url` değeri `https://PROJE_REF.supabase.co/functions/v1/reward-worker`, `library_reward_worker_secret` değeri bir önceki adımda oluşturduğun anahtar olmalı.
3. SQL Editor'de [reward-cron.sql](../supabase/ops/reward-cron.sql) dosyasını çalıştır. Cron her dakika worker'ı çağırır. Worker periyotları sonuçlandırır, sıradaki push bildirimlerini gönderir ve Expo'dan teslim sonucunu sorgular. Cron çalıştırma geçmişini ve Edge Function yanıtlarını kontrol et.

[Supabase Cron ve Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)

## Canlı kabul testi

- İki ayrı hesapla iki cihazda aynı odaya gir. Masada/Molada değişimini ölç ve ikinci ekranda hedefin 2 saniye olduğunu doğrula.
- Son boş masaya iki hesabın aynı anda katılmasını dene. Yalnızca biri kabul edilmeli.
- Bir periyotta doğrulamayı kaçır ve jeton artmadığını kontrol et. Geçerli bir periyodu tamamla, uygulamayı kapat ve Cron çalıştıktan sonra jetonun yalnızca bir kez yazıldığını doğrula.
- Gerçek cihazda yerel doğrulama hatırlatmasını, ödül push bildirimini, oturum kapatma ve hesap silmeyi test et.
- Aydınlatma metni taslağını yayın öncesi [yayın bilgileriyle](kvkk-yayin-notlari.md) tamamla.
