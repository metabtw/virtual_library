# Sanal Kütüphane yayın kurulumu

## Web ve Supabase

### Vercel yayını

Vercel Hobby kişisel veya ticari olmayan kullanım içindir. Reklam geliri olan bir yayında ticari kullanıma izin veren bir plan seç. [Vercel kullanım koşulları](https://vercel.com/legal/terms)

1. Vercel'de **Add New → Project** ile GitHub'daki `metabtw/virtual_library` deposunu içe aktar. Kök dizin `.`, Framework Preset **Other** ve Node.js **24.x** kullan. Derleme komutunu `vercel.json` belirler ve web çıktısı `dist/web` altında oluşturulur. [Vercel yapılandırması](../vercel.json)
2. Vercel **Settings → Environment Variables** bölümünde Production için `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` değerlerini gir. Veri sorumlusu ve TR/EN aydınlatma bilgilerini de ortam değişkenlerine ekle. Ortam değişkenleri değiştiğinde yeniden dağıt. [Web ortam değişkenleri](../.env.example) · [Aydınlatma metni](kvkk-yayin-notlari.md)
3. **Settings → Environments → Production → Branch Tracking** bölümünde `sanal-kutuphane-sosyal-oduller` dalını seç. **Deployments → Create Deployment** ile bu daldan bir dağıtım oluştur. Alan adını bağlamadan önce `.vercel.app` adresinde ana sayfayı, `/privacy`, `/privacy?lang=en` ve `/account-deletion` yollarını aç. [Vercel Git dağıtımları](https://vercel.com/docs/git#production-branch)
4. **Settings → Domains** bölümünde alan adını ekle. Vercel'in gösterdiği kök alan adı için A ve `www` için CNAME değerlerini DNS paneline gir. `www` kullanıyorsan Vercel'de ana adrese yönlendir. Mevcut posta MX, SPF ve DKIM kayıtlarını koru. HTTPS etkinleşince siteyi ana adresten aç. [Vercel alan adı kurulumu](https://vercel.com/docs/domains/working-with-domains/add-a-domain)

### Giriş ve e-posta

1. HTTPS adresini Supabase **Authentication → URL Configuration → Site URL** alanına kaydet. **Redirect URLs** listesine HTTPS kök adresini ve aynı adresteki `/account-deletion` yolunu ekle. Mobil bağlantı için `sanalkutuphane://auth` kaydını kullan. [Supabase yönlendirmeleri](https://supabase.com/docs/guides/auth/redirect-urls)
2. Firebase **Authentication → Settings → Authorized domains** listesine web alan adını ekle. Firebase alan adı alanına yalnızca ana makine adını yaz. Expo ve ayrı Supabase projelerindeki Google girişiyle Apple girişi için ilgili sağlayıcı kurulumunu uygula. [Google](supabase-kurulum.md#google-ile-giriş) · [Apple](supabase-kurulum.md#apple-ile-giriş)
3. E-posta sağlayıcında gönderen alan adını DNS üzerinden doğrula. Gönderen adresini ve SMTP bilgilerini Supabase **Authentication → Emails → SMTP Settings** bölümüne gir. **Confirm signup** ve **Magic link or OTP** şablonlarına giriş kodu şablonunu kaydet. Bir deneme hesabıyla kayıt, tekrar giriş ve hesap silme ekranında kod girişini doğrula. [Giriş ve SMTP kurulumu](supabase-kurulum.md#e-postayla-giriş)

Web hizmetinin `/healthz` yanıtı Supabase URL'si ve açık anahtar yapılandırıldığında **200** döner. Supabase erişimini HTTPS uygulamasından gerçek bir hesapla giriş ve oda işlemi yaparak doğrula.

Node.js 24 çalıştıran bir web hizmetinde depo kökünde `npm ci --omit=dev` ile kurulum yapıp `npm start` ile başlatabilirsin. Hizmetin atadığı `PORT` okunur.

## EAS, imzalama ve bildirimler

1. `mobile/` klasöründe `npx eas-cli login` ve `npx eas-cli init` ile uygulamayı yayıncının Expo hesabına bağla. EAS üretim ortamında [mobil istemci değerlerini](../mobile/.env.example), proje kimliğini `EXPO_PUBLIC_EAS_PROJECT_ID` ve HTTPS gizlilik adresini `EXPO_PUBLIC_PRIVACY_URL` olarak tanımla.
2. Firebase'deki Android uygulamasını `com.metabtw.sanalkutuphane` paket adıyla kaydet. `google-services.json` dosyasını EAS üretim ortamına `GOOGLE_SERVICES_JSON` adlı dosya değişkeni olarak yükle. Local prebuild sırasında aynı değişkene dosya yolunu verebilirsin. FCM v1 push kimlik bilgisini `npx eas-cli credentials --platform android` ile Expo'ya tanımla. [Expo FCM v1 kurulumu](https://docs.expo.dev/push-notifications/fcm-credentials/)
3. Apple Developer ve Google Play Console hesaplarında uygulamayı aynı paket kimliğiyle aç. EAS'te iOS dağıtım imzası, provisioning profile ve APNs push anahtarını, Android'de dağıtım keystore'unu yapılandır. [EAS imzalama](https://docs.expo.dev/app-signing/managed-credentials/) · [Expo bildirim kurulumu](https://docs.expo.dev/push-notifications/push-notifications-setup/)
4. Expo push güvenliğini etkinleştir ve Expo erişim belirtecini Supabase Edge Function Secrets içinde `EXPO_PUSH_ACCESS_TOKEN` olarak tanımla. Worker dakikada bir sırayı işler ve Expo biletini yaklaşık 15 dakika sonra teslim sonucu için sorgular. [Güvenli Expo push gönderimi](https://docs.expo.dev/push-notifications/sending-notifications/#additional-security)
5. Hata takibi için EAS ortamında `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG` ve `SENTRY_PROJECT` tanımla. Kaynak haritaları yüklenirken EAS gizli ortamında `SENTRY_AUTH_TOKEN` kullanılır. İsteğe bağlı kullanım ölçümü için `EXPO_PUBLIC_POSTHOG_KEY` ve `EXPO_PUBLIC_POSTHOG_HOST` tanımla. [Sentry Expo kurulumu](https://docs.sentry.io/platforms/react-native/manual-setup/expo/) · [PostHog React Native kurulumu](https://posthog.com/docs/libraries/react-native)

İmzalama hazır olduğunda `mobile/` klasöründen mağaza paketlerini oluştur.

```sh
npx eas-cli build --profile production --platform all
```

## Mağazaya göndermeden önce

Paketleri TestFlight ve Google Play dahili testinde iki ayrı cihazla aç. E-posta ve etkin sosyal sağlayıcılarla giriş yap. İki hesabın oda durumunu, davet kodunu ve ortak verilerini kontrol et. Android 12 ve üzerinde Profil'den **Hatırlatmaları tam zamanında göster** seçeneğiyle sistem iznini aç. Android ve iOS'ta ekran kilitliyken doğrulama hatırlatmasının geldiğini ve tamamlanan çalışmanın ödül bildiriminin ulaştığını doğrula. [Web ve mobil kabul testleri](../README.md#iki-istemciyle-kabul-testi)

Mağaza gizlilik sorularını kullanılan hizmetlere göre doldur. İnceleme ekibinin uygulamaya girebileceği bir deneme hesabı ve doğrulama adımlarını hazırla. Gönderimi yayıncı hesabından başlat. [App Store inceleme rehberi](https://developer.apple.com/app-store/review/guidelines/) · [Google Play hesap silme şartları](https://support.google.com/googleplay/android-developer/answer/13327111)
