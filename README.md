# Sanal Kütüphane

Avatarlı ortak çalışma odaları için ilk oynanabilir web sürümü.

## Çalıştırma

Node.js 24 veya üzeri gerekir. Harici paket kurulumu gerekmez.

```sh
npm start
```

Tarayıcıdan `http://localhost:3000` adresini aç. Ayrı kullanıcıları denemek için farklı tarayıcı profilleri kullan.

`PORT` ve `LIBRARY_DB` ortam değişkenleriyle bağlantı noktası ve SQLite dosyası ayarlanabilir. Varsayılan veritabanı `.data/library.sqlite` dosyasıdır.

## Kurallar

- Profil tarayıcıya HTTP-only çerezle bağlanır. İlk sürümde harici hesap sağlayıcısı bulunmaz.
- Odalar 12 kişiyle sınırlıdır. İstemciler aktif odanın durumunu saniyede bir yeniler. 15 saniye bağlantı kurmayan üyelerin masası boşalır.
- Periyotlar 25, 50 veya 90 dakikadır. Başlangıç, bitiş ve doğrulama pencereleri sunucunun saatine göre hesaplanır. Periyot bitiminden önceki her 20. dakikada 30 saniyelik doğrulama açılır.
- Sunucu tamamlanan her beş dakika için bir jeton verir. Harcamalar ve ödüller SQLite işlemleriyle kaydedilir.
- İlk web sürümü Node.js ve SQLite kullanır. Hesaplı giriş, Supabase Realtime Presence, Edge Function ve React Native Skia entegrasyonları sonraki aşamadadır.

## Doğrulama

```sh
npm test
```
