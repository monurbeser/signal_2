# CryptoSignal

BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT için 15 dakikalık Telegram sinyal botu.

## Proje Yapısı

```
src/
├── index.js              # Giriş noktası
├── config.js             # Tüm ayarlar
├── db.js                 # PostgreSQL bağlantısı
├── signals/
│   ├── fetcher.js        # CCXT veri çekme
│   ├── indicators.js     # RSI, MACD, BB, Volume
│   ├── engine.js         # Sinyal karar motoru
│   └── runner.js         # Analiz orkestratörü
├── telegram/
│   └── bot.js            # Mesaj gönderme
├── scheduler/
│   └── index.js          # Cron job (15 dk)
└── api/
    └── server.js         # Express API
```

## Kurulum

### 1. Telegram Bot Oluştur

1. [@BotFather](https://t.me/BotFather)'a git → `/newbot`
2. Bot adı ver → Token al
3. [@userinfobot](https://t.me/userinfobot)'a mesaj at → Chat ID al

### 2. Ortam Değişkenleri

```bash
cp .env.example .env
# .env dosyasını düzenle
```

```env
TELEGRAM_BOT_TOKEN=123456:ABCdef...
TELEGRAM_CHAT_ID=987654321
DATABASE_URL=postgresql://...  # Railway'den al
```

### 3. Lokal Çalıştırma

```bash
npm install
npm run dev
```

### 4. Railway Deploy

```bash
# Railway CLI ile
railway login
railway link
railway up

# Environment variables Railway dashboard'dan ekle:
# TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DATABASE_URL
```

## API Endpoint'leri

| Endpoint | Açıklama |
|----------|----------|
| `GET /health` | Servis durumu |
| `GET /api/signals` | Son 50 sinyal |
| `GET /api/analyze/BTC%2FUSDT` | Anlık analiz |
| `GET /api/preview/ETH%2FUSDT` | Telegram mesaj önizleme |

## Sinyal Mantığı

| İndikatör | Ağırlık | BUY Bölgesi | SELL Bölgesi |
|-----------|---------|-------------|--------------|
| RSI | %30 | < 30 | > 70 |
| MACD hist. | %25 | > 0 | < 0 |
| Bollinger | %20 | < %20 | > %80 |
| Fear & Greed | %15 | < 25 | > 75 |
| Hacim | %10 | +%30 artış | — |

- Güven ≥ 65 → **BUY**
- Güven ≤ 35 → **SELL**
- Arası → HOLD (gönderilmez)
- Cooldown: 30 dakika (aynı sembol tekrar sinyal üretmez)
- Min güven: 60 (düşük skorlar gönderilmez)

## Telegram Mesaj Örneği

```
🟢 BUY SİNYALİ — BTC/USDT

💰 Fiyat: $67,420 (+1.23%)
⏱ Timeframe: 15M

📊 Güven Skoru: 78/100
████████░░ 78%

📈 İndikatörler
  • RSI 27.4 — aşırı satım
  • MACD hist. +0.312 — yukarı momentum
  • BB %15 — alt banda yakın
  • F&G 22 — aşırı korku
  • Hacim +67% — güçlü onay

🕐 29.05.2026 14:15:00
```
