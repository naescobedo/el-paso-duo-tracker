/**
 * El Paso Duo Radar — Cloudflare Worker (100% Free 24/7 Cloud Tracker)
 * 
 * Runs continuously in the cloud even when your PC is turned off.
 * Polls Apple Store Cielo Vista Mall (R492) and sends instant alerts
 * to your phone via Discord Webhook (+ optional ntfy.sh).
 */

const STORE_ID = 'R492'; // Apple Store Cielo Vista Mall, El Paso, TX
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1564790820849057974/lZDAv_F_o8uCzPNCtrGxH0iRnKhVDff1I-JGe0srW_X1LGZLp40jZHMUm48stukdHwM8';
const NTFY_TOPIC = 'elpaso-duo-cielovista';

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

async function checkStockAndNotify(topic = NTFY_TOPIC, env = {}) {
  const partsQuery = PRODUCTS.map((p, i) => `parts.${i}=${encodeURIComponent(p.part)}`).join('&');
  const url = `https://www.apple.com/shop/retail/pickup-message?${partsQuery}&store=${STORE_ID}`;
  const discordUrl = env.DISCORD_WEBHOOK || DISCORD_WEBHOOK;

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

    const allowedStorages = (env && env.ALERT_STORAGES ? env.ALERT_STORAGES.split(',') : ['256GB']).map(s => s.trim());
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
      // 1. Dispatch to Discord (Reliable, loud, zero IP limits)
      if (discordUrl) {
        try {
          const embeds = available.map(p => ({
            title: `⚡ RESTOCK: iPhone Duo ${p.storage} · ${p.color}`,
            url: `https://www.apple.com/shop/buy-iphone/iphone-duo?skipul=1#${p.part}`,
            color: 0x00FF66,
            description: `**Apple Store Cielo Vista Mall (El Paso, TX)** has stock available for pickup right now!\n\n` +
              `📱 **[Open in Apple Store App](applestore://)**\n` +
              `🛍️ **[Open Bag / Checkout](https://www.apple.com/shop/bag)**\n` +
              `🔗 **[View on Apple.com](https://www.apple.com/shop/buy-iphone/iphone-duo?skipul=1#${p.part})**`,
            fields: [
              { name: 'Model', value: `iPhone Duo ${p.storage}`, inline: true },
              { name: 'Color', value: p.color, inline: true },
              { name: 'Price', value: p.price, inline: true },
              { name: 'Store', value: 'Cielo Vista Mall (#R492)', inline: false }
            ],
            footer: { text: 'El Paso Duo Radar • Cloudflare 24/7' },
            timestamp: new Date().toISOString()
          }));

          await fetch(discordUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `@everyone 🚨 **RESTOCK DROP DETECTED AT CIELO VISTA MALL!**`,
              embeds
            })
          });
        } catch (e) {
          console.error('Discord dispatch failed:', e);
        }
      }

      // 2. Dispatch to ntfy (fallback channel)
      for (const p of available) {
        try {
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
            body: `DROP DETECTED IN EL PASO!\n\nModel: iPhone Duo ${p.storage} · ${p.color} (${p.price})\nStore: Apple Cielo Vista Mall (#R492)\n\nTap below to open in Apple Store app and checkout immediately!`
          });
        } catch (_) {}
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
      await checkStockAndNotify(topic, env);
      // Wait 30 seconds
      await new Promise(r => setTimeout(r, 30000));
      // Check 2: 30s
      await checkStockAndNotify(topic, env);
    })());
  },

  // HTTP Request Handler
  async fetch(request, env) {
    const url = new URL(request.url);
    const topic = env.NTFY_TOPIC || NTFY_TOPIC;
    const discordUrl = env.DISCORD_WEBHOOK || DISCORD_WEBHOOK;

    if (url.pathname === '/test-notify') {
      let discordStatus = 'not_configured';

      if (discordUrl) {
        try {
          const dRes = await fetch(discordUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `@everyone 🔔 **Discord Restock Alert Test!**`,
              embeds: [{
                title: '✅ Cloudflare 24/7 Restock Tracker Connected!',
                color: 0x5865F2,
                description: `Your Cloudflare Worker is active and monitoring **Apple Store Cielo Vista Mall (R492)** in El Paso, TX.\n\n` +
                  `🎯 **Filter**: 256GB Only (Star White & Night Sky)\n` +
                  `⏱️ **Frequency**: Every 30 seconds (24/7 in the cloud)\n\n` +
                  `📱 **[Open Apple Store App](applestore://)**\n` +
                  `🛍️ **[Open Checkout Bag](https://www.apple.com/shop/bag)**`,
                footer: { text: 'El Paso Duo Radar • Cloudflare Edge' },
                timestamp: new Date().toISOString()
              }]
            })
          });
          discordStatus = dRes.status;
        } catch (e) {
          discordStatus = e.message;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        discord_status: discordStatus,
        message: 'Test notification sent to Discord! Check your Discord app.'
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const checkResult = await checkStockAndNotify(topic, env);
    return new Response(JSON.stringify({
      worker: 'El Paso Duo Cloudflare Worker',
      cron_interval: 'Every 30 seconds (24/7 cloud)',
      filter: '256GB Only',
      store: 'Apple Cielo Vista Mall (R492)',
      discord_configured: !!discordUrl,
      last_check: checkResult
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
