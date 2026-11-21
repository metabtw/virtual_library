# Aydınlatma metni için yayın bilgileri

Uygulamadaki Türkçe ve İngilizce metinler, kullanılan hesap ve uygulama verilerini özetleyen taslaklardır. Yayın öncesi proje sahibi kendi bilgileri ve fiilen etkin hizmetler üzerinden şu alanları tamamlar.

| Alan | Tamamlanacak bilgi |
| --- | --- |
| Veri sorumlusu | Resmî unvan, iletişim ve başvuru adresi |
| Amaçlar, toplama yöntemi ve hukuki sebepler | Hesap, oda durumu, çalışma geçmişi, jeton ve envanter için geçerli amaç ve işleme sebepleri |
| Hizmet sağlayıcılar ve aktarımlar | Etkin Supabase, Apple, Google, Expo, Sentry ve PostHog hizmetleri, işlenen alanlar, aktarım amacı ve konumu |
| Saklama ve silme | Hesap ve ilişkili kayıtlar, yedekler, hata kayıtları ve isteğe bağlı ölçüm verileri için gerçek süreler |
| İlgili kişinin hakları | KVKK kapsamındaki haklar ve kullanılabilir başvuru yolu |

Web hizmetine `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL`, `PRIVACY_DETAILS_TR` ve `PRIVACY_DETAILS_EN` değerlerini ver. `PRIVACY_DETAILS_TR` ve `PRIVACY_DETAILS_EN` alanları yukarıdaki amaç, dayanak, aktarım, saklama ve başvuru bilgilerini içerir. Sayfa `/privacy` yolunda Türkçe, `/privacy?lang=en` yolunda İngilizce açılır. Mobilde `EXPO_PUBLIC_PRIVACY_URL` için bu sayfanın HTTPS adresini kullan.

Canlı ortamda test hesabını silip profil, oturum geçmişi, envanter ve cihaz kaydının kaldırıldığını doğrula. Hesap silinince sahibinin özel odası kapanır, davet kodu ve üyelikler silinir, kullanıcı tarafından verilen oda adı genel bir adla değiştirilir. Üçüncü taraf hizmetlerdeki ve yedeklerdeki saklama sürelerini belgeye yansıt.
