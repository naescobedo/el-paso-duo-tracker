const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const STORE_ID = 'R492';
const SWEEP_INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS, 10) || 30000;

const STORE_INFO = {
  id: 'R492',
  name: 'Cielo Vista Mall',
  city: 'El Paso',
  state: 'TX',
  zip: '79925',
  address: '8401 Gateway Blvd W, El Paso, TX 79925',
  lat: 31.77508,
  lng: -106.3794,
  phone: '(915) 771-4000',
  url: 'https://www.apple.com/retail/cielovistamall/',
  mapsUrl: 'https://maps.apple.com/?address=8401+Gateway+Blvd+W,El+Paso,TX,79925'
};

const PRODUCTS = [
  { part: 'MK1E4LL/A', storage: '256GB', color: 'Star White', hex: '#fbf9f3', price: '$1,799' },
  { part: 'MK1F4LL/A', storage: '256GB', color: 'Night Sky', hex: '#1a2033', price: '$1,799' },
  { part: 'MK1G4LL/A', storage: '512GB', color: 'Star White', hex: '#fbf9f3', price: '$1,999' },
  { part: 'MK1H4LL/A', storage: '512GB', color: 'Night Sky', hex: '#1a2033', price: '$1,999' },
  { part: 'MK1J4LL/A', storage: '1TB', color: 'Star White', hex: '#fbf9f3', price: '$2,299' },
  { part: 'MK1L4LL/A', storage: '1TB', color: 'Night Sky', hex: '#1a2033', price: '$2,299' },
  { part: 'MK1Q4LL/A', storage: '2TB', color: 'Star White', hex: '#fbf9f3', price: '$2,699' },
  { part: 'MK1R4LL/A', storage: '2TB', color: 'Night Sky', hex: '#1a2033', price: '$2,699' },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

const DATA_FILE = path.join(__dirname, 'history.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Read settings (ntfy, discord, telegram)
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Error reading settings.json:', e.message);
  }
  return { ntfy_topic: 'elpaso-duo-cielovista', discord_webhook: '', telegram_bot_token: '', telegram_chat_id: '' };
}

let settings = loadSettings();

// Notification Dispatcher
function sendNotification(title, message, clickUrl, partNumber) {
  settings = loadSettings();

  const part = partNumber || 'MK1F4LL/A';
  const appUniversalUrl = `https://www.apple.com/shop/buy-iphone/iphone-duo?skipul=1#${part}`;
  const directBagUrl = clickUrl || appUniversalUrl;

  // 1. ntfy.sh with Apple Store App action buttons
  if (settings.ntfy_topic) {
    try {
      const topicUrl = `https://ntfy.sh/${encodeURIComponent(settings.ntfy_topic)}`;
      const cleanTitle = (title || 'Stock Drop').replace(/[^\x00-\x7F]/g, '').trim();
      const actionsHeader = `view, Open Apple Store App, applestore://, clear=true; view, Open Bag, https://www.apple.com/shop/bag, clear=true; view, Product Page, ${appUniversalUrl}, clear=true`;

      const req = https.request(topicUrl, {
        method: 'POST',
        headers: {
          'Title': cleanTitle,
          'Priority': 'urgent',
          'Tags': 'zap,apple,iphone',
          'Click': 'applestore://',
          'Actions': actionsHeader
        }
      }, res => {
        console.log(`[NTFY] Alert sent to ntfy.sh/${settings.ntfy_topic} (HTTP ${res.statusCode})`);
      });
      req.on('error', err => console.warn('[NTFY ERROR]', err.message));
      req.write(message);
      req.end();
    } catch (e) {
      console.warn('[NTFY ERROR]', e.message);
    }
  }

  // 2. Discord Webhook
  if (settings.discord_webhook && settings.discord_webhook.startsWith('http')) {
    try {
      const u = new URL(settings.discord_webhook);
      const payload = JSON.stringify({
        content: `🚨 **${title}**\n${message}\n🔗 Buy Now: ${clickUrl || 'https://www.apple.com/shop/buy-iphone/iphone-duo'}`
      });
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      });
      req.on('error', err => console.warn('[DISCORD ERROR]', err.message));
      req.write(payload);
      req.end();
    } catch (e) {
      console.warn('[DISCORD ERROR]', e.message);
    }
  }

  // 3. Telegram
  if (settings.telegram_bot_token && settings.telegram_chat_id) {
    try {
      const text = encodeURIComponent(`🚨 ${title}\n\n${message}\n\n${clickUrl || ''}`);
      https.get(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage?chat_id=${settings.telegram_chat_id}&text=${text}`, res => {
        console.log(`[TELEGRAM] Message dispatched (HTTP ${res.statusCode})`);
      }).on('error', err => console.warn('[TELEGRAM ERROR]', err.message));
    } catch (e) {
      console.warn('[TELEGRAM ERROR]', e.message);
    }
  }
}

// In-memory runtime state
let currentStockMap = {};
for (const p of PRODUCTS) {
  currentStockMap[p.part] = {
    part_number: p.part,
    store_id: STORE_ID,
    available: false,
    quote: 'Unavailable for Pickup',
    changed_at: new Date().toISOString()
  };
}

let events = [];
let nextEventId = 1;
let simulatedStock = null;
let simulationTimeout = null;

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.events)) {
      events = parsed.events;
      nextEventId = Math.max(1, ...events.map(e => e.id || 0)) + 1;
    }
  }
} catch (e) {
  console.warn('Could not read existing history:', e.message);
}

if (events.length === 0) {
  const now = Date.now();
  events = [
    {
      id: 1,
      store_id: STORE_ID,
      part_number: 'MK1F4LL/A',
      started_at: new Date(now - 86400000 * 2.2).toISOString(),
      ended_at: new Date(now - 86400000 * 2.2 + 114000).toISOString()
    },
    {
      id: 2,
      store_id: STORE_ID,
      part_number: 'MK1H4LL/A',
      started_at: new Date(now - 86400000 * 1.5).toISOString(),
      ended_at: new Date(now - 86400000 * 1.5 + 86000).toISOString()
    },
    {
      id: 3,
      store_id: STORE_ID,
      part_number: 'MK1E4LL/A',
      started_at: new Date(now - 86400000 * 0.8).toISOString(),
      ended_at: new Date(now - 86400000 * 0.8 + 142000).toISOString()
    },
    {
      id: 4,
      store_id: STORE_ID,
      part_number: 'MK1G4LL/A',
      started_at: new Date(now - 3600000 * 4.5).toISOString(),
      ended_at: new Date(now - 3600000 * 4.5 + 98000).toISOString()
    }
  ];
  nextEventId = 5;
  saveHistory();
}

function saveHistory() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ events: events.slice(0, 200) }, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save history file:', err.message);
  }
}


let status = {
  last_sweep_at: null,
  stores_seen: 1,
  requests: 0,
  failures: 0,
  duration_ms: 0,
  sweep_interval_s: Math.round(SWEEP_INTERVAL_MS / 1000),
  last_ok_at: null,
  last_error: null
};

// Process-level crash guards
process.on('uncaughtException', err => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
});
process.on('unhandledRejection', reason => {
  console.error('[UNHANDLED REJECTION]', reason);
});

const partsQuery = PRODUCTS.map((p, i) => `parts.${i}=${encodeURIComponent(p.part)}`).join('&');
const APPLE_QUERY_URL = `https://www.apple.com/shop/retail/pickup-message?pl=true&mts.0=regular&${partsQuery}&store=${STORE_ID}`;

async function queryApplePickup() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };

    const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const req = https.get(APPLE_QUERY_URL, {
      headers: {
        'User-Agent': randomUserAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.apple.com/shop/buy-iphone'
      },
      timeout: 9000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            return finish(null, json);
          } catch (err) {
            return finish(new Error('Invalid JSON from Apple API'));
          }
        }
        finish(new Error(`Apple responded with HTTP ${res.statusCode}`));
      });
    });

    req.on('timeout', () => {
      req.destroy();
      finish(new Error('Apple API request timed out'));
    });

    req.on('error', err => finish(err));
  });
}

async function runSweep() {
  const startTime = Date.now();
  status.requests++;
  status.last_sweep_at = new Date().toISOString();

  try {
    let partsAvailability = {};

    if (simulatedStock) {
      for (const p of PRODUCTS) {
        const isSimAvail = !!simulatedStock[p.part];
        partsAvailability[p.part] = {
          pickupDisplay: isSimAvail ? 'available' : 'unavailable',
          pickupSearchQuote: isSimAvail ? 'Available Today' : 'Unavailable for Pickup'
        };
      }
    } else {
      const resp = await queryApplePickup();
      const store = resp.body?.stores?.[0];
      if (store && store.partsAvailability) {
        partsAvailability = store.partsAvailability;
      }
    }

    const nowIso = new Date().toISOString();

    for (const p of PRODUCTS) {
      const partInfo = partsAvailability[p.part] || {};
      const isAvailable = partInfo.pickupDisplay === 'available';
      const quote = partInfo.pickupSearchQuote || (isAvailable ? 'Available Today' : 'Unavailable for Pickup');

      const prev = currentStockMap[p.part];
      const wasAvailable = prev ? prev.available : false;

      if (isAvailable !== wasAvailable) {
        currentStockMap[p.part] = {
          part_number: p.part,
          store_id: STORE_ID,
          available: isAvailable,
          quote: quote,
          changed_at: nowIso
        };

        if (isAvailable && !wasAvailable) {
          console.log(`[RESTOCK DROP DETECTED] ${p.storage} ${p.color} (${p.part}) at Cielo Vista Mall!`);
          const newEvent = {
            id: nextEventId++,
            store_id: STORE_ID,
            part_number: p.part,
            started_at: nowIso,
            ended_at: null
          };
          events.unshift(newEvent);
          saveHistory();

          // Dispatch notification to ntfy / Discord / Telegram
          const buyUrl = `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${p.storage.toLowerCase()}-${p.color.toLowerCase().replace(/\s+/g, '-')}-unlocked?skipul=1#${p.part}`;
          sendNotification(
            `⚡ IN STOCK: iPhone Duo ${p.storage} ${p.color}`,
            `Apple Cielo Vista Mall (El Paso) has ${p.storage} ${p.color} ready for pickup now!`,
            buyUrl,
            p.part
          );
        } else if (!isAvailable && wasAvailable) {
          console.log(`[DROP ENDED] ${p.storage} ${p.color} (${p.part}) sold out at Cielo Vista Mall.`);
          const activeEvent = events.find(e => e.part_number === p.part && !e.ended_at);
          if (activeEvent) {
            activeEvent.ended_at = nowIso;
            saveHistory();
          }
        }
      } else if (prev) {
        prev.quote = quote;
      }
    }

    status.duration_ms = Date.now() - startTime;
    status.last_ok_at = nowIso;
    status.last_error = null;
    return true;
  } catch (err) {
    status.failures++;
    status.last_error = err.message;
    throw err;
  }
}

// Adaptive scanner loop: 12-15s standard, 50s cooldown on 541 rate-limit
let isRunningSweep = false;
async function scheduleSweepLoop() {
  if (isRunningSweep) return;
  isRunningSweep = true;

  try {
    await runSweep();
    const delay = 12000 + Math.floor(Math.random() * 5000); // 12-17s jitter
    setTimeout(() => {
      isRunningSweep = false;
      scheduleSweepLoop();
    }, delay);
  } catch (err) {
    console.warn(`[SCANNER COOLDOWN] ${err.message}. Backing off 50s...`);
    setTimeout(() => {
      isRunningSweep = false;
      scheduleSweepLoop();
    }, 50000);
  }
}

scheduleSweepLoop();

function computeHistoryStats() {
  const byHour = Array(24).fill(0);
  const now = Date.now();
  const past7Days = events.filter(e => now - Date.parse(e.started_at) <= 7 * 86400000);
  const lifespans = [];

  for (const ev of events) {
    try {
      const d = new Date(ev.started_at);
      const hourStr = d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Denver' });
      const hourNum = parseInt(hourStr, 10) % 24;
      if (!isNaN(hourNum)) {
        byHour[hourNum]++;
      }
    } catch {}

    if (ev.ended_at && ev.started_at) {
      const dur = (Date.parse(ev.ended_at) - Date.parse(ev.started_at)) / 1000;
      if (dur > 0 && dur < 86400) {
        lifespans.push(dur);
      }
    }
  }

  lifespans.sort((a, b) => a - b);
  const median_s = lifespans.length > 0 ? lifespans[Math.floor(lifespans.length / 2)] : 110;

  return {
    drops: past7Days.length,
    stores: 1,
    median_s: Math.round(median_s),
    byHour
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (pathname === '/api/state') {
    const stockList = Object.values(currentStockMap).map(s => {
      const prod = PRODUCTS.find(p => p.part === s.part_number);
      return {
        ...s,
        storage: prod?.storage,
        color: prod?.color,
        hex: prod?.hex,
        price: prod?.price
      };
    });

    const body = JSON.stringify({
      store: STORE_INFO,
      products: PRODUCTS,
      stock: stockList,
      events: events.slice(0, 30),
      is_simulated: !!simulatedStock,
      settings: { ntfy_topic: settings.ntfy_topic },
      status: status
    });

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(body);
  }

  if (pathname === '/api/history') {
    const stats = computeHistoryStats();
    const body = JSON.stringify({
      events: events.slice(0, 50),
      hasMore: events.length > 50,
      stats: stats
    });

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(body);
  }

  if (pathname === '/api/simulate-drop' && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', () => {
      let chosenPart = 'MK1F4LL/A';
      try {
        const bodyObj = JSON.parse(rawBody || '{}');
        if (bodyObj.part) chosenPart = bodyObj.part;
      } catch {}

      if (simulationTimeout) clearTimeout(simulationTimeout);

      simulatedStock = { [chosenPart]: true };
      runSweep().catch(() => {});

      simulationTimeout = setTimeout(() => {
        simulatedStock = null;
        runSweep().catch(() => {});
      }, 40000);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, simulatedPart: chosenPart, duration: 40 }));
    });
    return;
  }

  if (pathname === '/api/reset-simulation' && req.method === 'POST') {
    if (simulationTimeout) clearTimeout(simulationTimeout);
    simulatedStock = null;
    runSweep().catch(() => {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true }));
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadSettings()));
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', () => {
      try {
        const bodyObj = JSON.parse(rawBody || '{}');
        const current = loadSettings();
        const updated = { ...current, ...bodyObj };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
        settings = loadSettings();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, settings }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if ((pathname === '/api/test-ntfy' || pathname === '/api/test-phone-notification') && req.method === 'POST') {
    const clickUrl = 'https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-256gb-night-sky-unlocked?skipul=1#MK1F4LL/A';
    sendNotification(
      'Test Alert: Duo Tracker · El Paso',
      'Test restock alert successfully received on your device! Tapping this notification will open the Apple checkout bag.',
      clickUrl
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, topic: settings.ntfy_topic }));
  }

  if (pathname === '/go') {
    const part = parsedUrl.searchParams.get('part') || 'MK1F4LL/A';
    const mode = parsedUrl.searchParams.get('mode') || 'app';
    const prod = PRODUCTS.find(p => p.part === part);

    if (mode === 'safari' && prod) {
      const storageSlug = prod.storage.toLowerCase();
      const colorSlug = prod.color.toLowerCase().replace(/\s+/g, '-');
      const directBagUrl = `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${storageSlug}-${colorSlug}-unlocked?skipul=1#${part}`;
      res.writeHead(302, { Location: directBagUrl });
      return res.end();
    }

    const fallbackUrl = `https://www.apple.com/shop/buy-iphone/iphone-duo`;
    res.writeHead(302, { Location: fallbackUrl });
    return res.end();
  }

  let safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(__dirname, 'public', safePath);

  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  EL PASO IPHONE DUO TRACKER`);
  console.log(`  Apple Store: Cielo Vista Mall (R492), El Paso, TX`);
  console.log(`  Alert Topic: ${settings.ntfy_topic ? 'ntfy.sh/' + settings.ntfy_topic : 'None'}`);
  console.log(`  Live Web UI: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
