# Sanal Kütüphane yayın kurulumu

## Web ve Supabase

1. Web uygulamasını Node.js 24 çalıştıran bir hizmete bağla. Depo kökünde kurulum komutu `npm ci --omit=dev`, başlatma komutu `npm start`. Hizmetin atadığı `PORT` otomatik okunur. Supabase proje adresini ve publishable key'i [web ortam ayarlarına](../.env.example) gir.
2. HTTPS web adresi hazır olduğunda Supabase **Authentication → URL Configuration → Site URL** alanına kaydet. Yönlendirme listesine HTTPS kök adresini, aynı adresteki `/account-deletion` yolunu ve mobil için `sanalkutuphane://auth` değerini ekle. [Supabase yönlendirmeleri](https://supabase.com/docs/guides/auth/redirect-urls)
3. Supabase'de genel e-posta teslimi için doğrulanmış gönderici adresiyle SMTP kur. Bir deneme hesabıyla kayıt, tekrar giriş ve hesap silme bağlantısı iste. Giriş e-postasında kod da sunacağın zaman her iki şablona `{{ .Token }}` ekle ve istemcilerde `EXPO_PUBLIC_AUTH_EMAIL_CODE=true` ayarla. [Giriş ve sağlayıcı kurulumu](supabase-kurulum.md#e-postayla-giriş)
4. Google ve Apple sağlayıcılarını kendi istemci kimliği ve sırrıyla Supabase'de etkinleştir. Aynı girişleri sunmak istediğin web ve EAS ortamlarında `EXPO_PUBLIC_AUTH_GOOGLE` ve `EXPO_PUBLIC_AUTH_APPLE` değerlerini `true` yap. [Google](supabase-kurulum.md#google-ile-giriş) · [Apple](supabase-kurulum.md#apple-ile-giriş)
5. Web ortamında veri sorumlusu ve TR/EN aydınlatma bilgilerini doldur. Her iki dilde gizlilik adresini ve hesap silme akışını aç. Mağaza formlarında gizlilik URL'si olarak `/privacy`, web hesabı silme URL'si olarak `/account-deletion` yolunu kullan. [Aydınlatma metni alanları](kvkk-yayin-notlari.md)

Web hizmetinin `/healthz` yanıtı Supabase URL'si ve açık anahtar yapılandırıldığında **200** döner. Supabase erişimini HTTPS uygulamasından gerçek bir hesapla giriş ve oda işlemi yaparak doğrula. Özel odadaki masa durumu için son migration ve güncel istemciler kullanılır.

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
