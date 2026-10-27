# El Paso Duo Radar 📡⚡
> **Live Apple Store Inventory Radar & Instant Restock Alerts for iPhone Duo**  
> Store Focus: **Apple Store Cielo Vista Mall (`R492`) — El Paso, TX**

![El Paso Duo Radar](https://img.shields.io/badge/Store-Cielo%20Vista%20Mall%20(R492)-orange?style=flat-square)
![Interval](https://img.shields.io/badge/Sweep-Every%2030s-blue?style=flat-square)
![Alerts](https://img.shields.io/badge/Push%20Alerts-ntfy.sh%20(iOS%20%26%20Android)-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

---

## ⚡ Overview

**El Paso Duo Radar** is a zero-dependency, real-time inventory tracking engine and visual radar dashboard designed specifically for the Apple Store at Cielo Vista Mall in El Paso, Texas. It continuously sweeps Apple's official fulfillment system every 30 seconds for all 8 iPhone Duo storage and finish configurations.

When a restock drop is detected, it immediately plays a local chime, flashes the radar screen, and dispatches high-priority **mobile push notifications** straight to your phone (iOS & Android) with a 1-tap checkout bag link.

---

## ✨ Features

- **Store-Specific Radar**: Dedicated to **Apple Cielo Vista Mall (`R492`)** (8401 Gateway Blvd W, El Paso, TX).
- **All 8 Configurations Tracked**:
  - **256GB**: Star White (`MK1E4LL/A`) · Night Sky (`MK1F4LL/A`)
  - **512GB**: Star White (`MK1G4LL/A`) · Night Sky (`MK1H4LL/A`)
  - **1TB**: Star White (`MK1J4LL/A`) · Night Sky (`MK1L4LL/A`)
  - **2TB**: Star White (`MK1Q4LL/A`) · Night Sky (`MK1R4LL/A`)
- **30-Second Polling Loop**: Lightweight HTTP poller with cooldown backoff handling to prevent rate limits.
- **📱 Phone Push Notifications (Works When PC Is Off)**:
  - Integrated with **[ntfy.sh](https://ntfy.sh)** (free, zero-registration push service).
  - Urgent priority push notification with sound delivered to your iPhone or Android.
  - Tapping the notification opens Safari / Apple Store directly with the dropped item in your checkout bag (`skipul=1#[SKU]`).
- **Aesthetic Cosmic Dark UI**:
  - Obsidian space theme (`#05060a`) with glowing range rings (5 mi, 15 mi, 30 mi) and animated sweep beam.
  - El Paso landmark markers (Franklin Mountains, Downtown, Airport, Juarez).
- **Mountain Time Analytics**: 24-hour histogram calibrated to El Paso time zone to highlight morning restocking windows.
- **⚡ Built-in Drop Simulator**: Trigger instant simulated drops anytime to test audio, notifications, and animations.

---

## 🚀 Quickstart (Run Locally)

The server is built with native Node.js (`http`, `https`, `fs`, `path`) and requires **zero `npm install` dependencies**:

```bash
# Clone the repository
git clone https://github.com/naescobedo/el-paso-duo-tracker.git
cd el-paso-duo-tracker

# Start the server
npm start
```

Open **`http://localhost:3000`** in any web browser.

---

## 📱 Mobile Phone Notifications Setup

1. **Install the free `ntfy` app**:
   - [iOS App Store](https://apps.apple.com/app/ntfy/id1625396347)
   - [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
2. **Subscribe to your topic**:
   - Open the app, tap `+`, and subscribe to:
     ```text
     elpaso-duo-cielovista
     ```
     *(Or enter your custom topic set in `settings.json` or the web UI).*
3. **Test the alert**:
   - Click **"Send Test Alert to Phone"** in the web dashboard at `http://localhost:3000`.

---

## ☁️ 24/7 Cloud Deployment (Runs When PC Is Off)

### Option A: Render.com (Recommended Free Web Service)
This repository includes a [`render.yaml`](render.yaml) blueprint:
1. Fork or push this repository to your GitHub.
2. Sign in to [render.com](https://render.com) and click **New +** &rarr; **Web Service**.
3. Select this repository and click **Deploy**.
4. Render runs the dashboard and scanning engine 24/7 for free.

### Option B: Cloudflare Worker (100% Free Serverless Cron)
This repository includes a standalone [`cloudflare-worker.js`](cloudflare-worker.js) script:
1. In the [Cloudflare Dashboard](https://dash.cloudflare.com), create a new Worker.
2. Paste the code from `cloudflare-worker.js` and deploy.
3. Under **Settings &rarr; Triggers &rarr; Cron Triggers**, set schedule to `* * * * *` (every 1 minute).

---

## ⚙️ Configuration (`settings.json`)

```json
{
  "ntfy_topic": "elpaso-duo-cielovista",
  "discord_webhook": "",
  "telegram_bot_token": "",
  "telegram_chat_id": ""
}
```

---

## ⚖️ Disclaimer

Not affiliated with Apple Inc. Availability data is checked directly against Apple's public retail fulfillment system. Always verify final pickup time slots during checkout on [apple.com](https://apple.com).
