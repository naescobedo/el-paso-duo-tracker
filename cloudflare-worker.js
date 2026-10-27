/**
 * El Paso Duo Radar — Cloudflare Worker (100% Free 24/7 Cloud Tracker)
 * 
 * Runs continuously in the cloud even when your PC is turned off.
 * Polls Apple Store Cielo Vista Mall (R492) and sends instant push
 * notifications to your phone via ntfy.sh.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create Worker.
 * 2. Paste this code into the worker editor and click "Deploy".
 * 3. Go to Settings -> Triggers -> Cron Triggers -> Add Cron:
 *    Set to "* * * * *" (runs every 1 minute for free).
 * 4. Install the free "ntfy" app on your iPhone/Android and subscribe to your topic.
 */

const STORE_ID = 'R492'; // Apple Store Cielo Vista Mall, El Paso, TX
const NTFY_TOPIC = 'elpaso-duo-cielovista'; // Change this to your private topic name

const PRODUCTS = [
  { part: 'MK1E4LL/A', storage: '256GB', color: 'Star White', price: '$1,799' },
  { part: 'MK1F4LL/A', storage: '256GB', color: 'Night Sky', price: '$1,799' },
  { part: 'MK1G4LL/A', storage: '512GB', color: 'Star White', price: '$1,999' },
  { part: 'MK1H4LL/A', storage: '512GB', color: 'Night Sky', price: '$1,999' },
  { part: 'MK1J4LL/A', storage: '1TB', color: 'Star White', price: '$2,299' },
  { part: 'MK1L4LL/A', storage: '1TB', color: 'Night Sky', price: '$2,299' },
  { part: 'MK1Q4LL/A', storage: '2TB', color: 'Star White', price: '$2,699' },
  { part: 'MK1R4LL/A', storage: '2TB', color: 'Night Sky', price: '$2,699' }
];

async function checkStockAndNotify(topic = NTFY_TOPIC) {
  const partsQuery = PRODUCTS.map((p, i) => `parts.${i}=${encodeURIComponent(p.part)}`).join('&');
  const url = `https://www.apple.com/shop/retail/pickup-message?${partsQuery}&store=${STORE_ID}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.apple.com/shop/buy-iphone'
      }
    });

    if (!res.ok) {
      return { status: 'error', code: res.status, message: `Apple responded with HTTP ${res.status}` };
    }

    const data = await res.json();
    const store = data.body?.stores?.[0];
    const partsMap = store?.partsAvailability || {};

    const allowedStorages = (env.ALERT_STORAGES ? env.ALERT_STORAGES.split(',') : ['512GB']).map(s => s.trim());
    const available = [];
    for (const p of PRODUCTS) {
      const info = partsMap[p.part] || {};
      if (info.pickupDisplay === 'available') {
        if (allowedStorages.includes('all') || allowedStorages.includes(p.storage)) {
          available.push(p);
        }
      }
    }

    if (available.length > 0) {
      // Stock drop detected! Push to phone
      for (const p of available) {
        const storageSlug = p.storage.toLowerCase();
        const colorSlug = p.color.toLowerCase().replace(/\s+/g, '-');
        const appUniversalUrl = `https://www.apple.com/shop/buy-iphone/iphone-duo?skipul=1#${p.part}`;
        const actionsHeader = `view, Open Apple Store App, applestore://, clear=true; view, Open Bag, https://www.apple.com/shop/bag, clear=true; view, Product Page, ${appUniversalUrl}, clear=true`;

        await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers: {
            'Title': `RESTOCK: ${p.storage} ${p.color} at Cielo Vista Mall!`,
            'Priority': 'urgent',
            'Tags': 'iphone,rotating_light,shopping_bags',
            'Click': 'applestore://',
            'Actions': actionsHeader,
            'Content-Type': 'text/plain; charset=utf-8'
          },
          body: `DROP DETECTED IN EL PASO!\n\nModel: iPhone Duo ${p.storage} · ${p.color} (${p.price})\nStore: Apple Cielo Vista Mall (Store #R492)\n\nTap below to open in Apple Store app and checkout immediately!`
        });
      }
      return { status: 'drop_detected', count: available.length, models: available };
    }

    return { status: 'checked_no_drops', timestamp: new Date().toISOString() };
  } catch (err) {
    return { status: 'exception', error: err.message };
  }
}

export default {
  // Cloudflare Scheduled Event (Runs every minute, with 30s dual-check)
  async scheduled(event, env, ctx) {
    const topic = env.NTFY_TOPIC || NTFY_TOPIC;
    ctx.waitUntil((async () => {
      // Check 1: 0s
      await checkStockAndNotify(topic);
      // Wait 30 seconds
      await new Promise(r => setTimeout(r, 30000));
      // Check 2: 30s
      await checkStockAndNotify(topic);
    })());
  },

  // HTTP Request Handler (Visit your worker URL in browser to test or view status)
  async fetch(request, env) {
    const url = new URL(request.url);
    const topic = env.NTFY_TOPIC || NTFY_TOPIC;

    if (url.pathname === '/test-notify') {
      const sample = PRODUCTS[1]; // 256GB Night Sky
      await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers: {
          'Title': '📱 Cloudflare Worker Test Alert',
          'Priority': 'urgent',
          'Tags': 'cloud,bell',
          'Click': 'https://www.apple.com/shop/buy-iphone/iphone-duo',
          'Content-Type': 'text/plain; charset=utf-8'
        },
        body: 'Cloudflare Worker 24/7 tracker is working! You will get alerts even when your computer is off.'
      });
      return new Response(JSON.stringify({ success: true, topic }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const checkResult = await checkStockAndNotify(topic);
    return new Response(JSON.stringify({
      worker: 'El Paso Duo Cloudflare Worker',
      cron_interval: 'Every 1 minute (24/7 cloud)',
      ntfy_topic: topic,
      last_check: checkResult
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
