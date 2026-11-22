# Ödüllü reklam kurulumu

Ödüllü reklamlar web ve mobilde aynı cüzdanı ve bekleme süresini kullanır. Doğrulanan bir izleme 5 jeton verir. İlk izleme 10, ikinci izleme 20, üçüncü ve sonraki izlemeler 40 dakika bekleme başlatır. İzleme sırası İstanbul saatiyle gece yarısı yenilenir. Başlamış bekleme süresi dolana kadar devam eder.

Bu dalı ayrı bir Supabase test projesine bağla. Migration'ları uygula ve `library`, `reward-worker`, `ad-reward` Edge Function'larını dağıt. [Supabase kurulumu](supabase-kurulum.md)

## Android ve iOS

1. AdMob'da Android ve iOS uygulamalarını ve her uygulama için bir ödüllü reklam birimini oluştur.
2. EAS derleme ortamına uygulama kimliklerini `ADMOB_ANDROID_APP_ID` ve `ADMOB_IOS_APP_ID` olarak ekle. Yerel derlemede aynı alanlar `mobile/.env.local` dosyasına girilebilir.
3. Supabase Edge Function Secrets bölümüne ödüllü reklam birimlerini `REWARDED_ADMOB_ANDROID_UNIT` ve `REWARDED_ADMOB_IOS_UNIT` olarak gir. AdMob'daki her birimin sunucu tarafı doğrulama adresi `https://<proje>.supabase.co/functions/v1/ad-reward/admob` olmalı. Uygulama izleme işleminin rastgele kodunu AdMob'a `custom_data` alanında geçirir. [AdMob sunucu tarafı doğrulaması](https://developers.google.com/admob/android/ssv)
4. Geliştirme veya önizleme derlemesini yeniden al. Yayından önce AdMob'da test cihazı tanımla ve fiziksel cihazda izin akışını, reklamın tamamlanmasını ve tek ödül kaydını kontrol et.

## Web

Web için tamamlanan izlemeyi kendi sunucusunda doğrulayabilen bir ödüllü video sağlayıcısı kullan. Sağlayıcının yerleşim adresini `REWARDED_WEB_URL` olarak Supabase Edge Function Secrets bölümünde tanımla. Yerleşim açılırken sonuna `attempt` parametresi eklenir. Her başarılı izleme için sağlayıcının sunucusu bu deneme kodunu ve kendi işlem kimliğini şu uç noktaya göndermeli.

```text
POST https://<proje>.supabase.co/functions/v1/ad-reward/web
Content-Type: application/json
X-Reward-Signature: <ham JSON gövdesinin HMAC-SHA256 imzası, hex>
```

```json
{
  "attempt": "<yerleşim adresindeki UUID>",
  "transaction": "<sağlayıcının benzersiz işlem kimliği>",
  "timestamp": 1795293600000
}
```

`timestamp`, tamamlanma anının milisaniye cinsinden Unix zamanıdır. Sağlayıcı sunucusu ve Edge Function, en az 32 karakterlik aynı `REWARDED_WEB_SECRET` değerini kullanır. Sırrı iki sunucunun gizli ortam ayarlarına gir. Başarılı doğrulamanın ardından mağaza güncel bakiyeyi ve bekleme süresini gösterir.

## Test et

- Reklamı yarıda kapat ve bakiyenin aynı kaldığını kontrol et.
- Tam izlemeyi tamamla. 5 jetonun bir kez eklendiğini ve reklam düğmesinde geri sayım başladığını kontrol et.
- Aynı hesabı başka cihazda aç. Bakiye ve bekleme süresi eşleşmeli.
- `npm run test:postgres` ödülün bir kez işlenmesini ve 10/20/40 dakika kuralını geçici veritabanında sınar. Deno testleri AdMob ve web imzalarını test anahtarlarıyla doğrular.
