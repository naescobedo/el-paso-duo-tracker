// ==========================================================================
// EL PASO DUO TRACKER — FRONTEND LOGIC & REAL-TIME RADAR
// ==========================================================================

(() => {
  // Application State
  const state = {
    products: [],
    stock: [],
    events: [],
    stats: null,
    store: null,
    isSimulated: false,
    lastSweepAt: null,
    filterStorage: 'all',
    checkoutMode: localStorage.getItem('ep_checkout_mode') || 'app',
    soundEnabled: localStorage.getItem('ep_sound_enabled') !== 'false',
    previousStock: {}, // map of part -> boolean
    initialized: false
  };

  // DOM Elements
  const elConnectionStatus = document.getElementById('connection-status');
  const elLiveDot = document.getElementById('live-dot');
  const elRadarHeadline = document.getElementById('radar-headline');
  const elRadarDescription = document.getElementById('radar-description');
  const elStoreMarkerGroup = document.getElementById('store-marker-group');
  const elPickupCard = document.getElementById('pickup-card');
  const elStockBadge = document.getElementById('stock-badge');
  const elStockHeadline = document.getElementById('stock-headline');
  const elStockSubtext = document.getElementById('stock-subtext');
  const elActiveDropsContainer = document.getElementById('active-drops-container');
  const elActiveDropsList = document.getElementById('active-drops-list');
  const elModelsGrid = document.getElementById('models-grid');
  const elHourlyBars = document.getElementById('hourly-bars');
  const elDropLogsBody = document.getElementById('drop-logs-body');
  const elTotalDropsBadge = document.getElementById('total-drops-badge');
  const elMedianDur = document.getElementById('metric-median-dur');
  const elAudio = document.getElementById('audio-chime');

  // Control Buttons
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const btnTogglePush = document.getElementById('btn-toggle-push');
  const btnTestChime = document.getElementById('btn-test-chime');
  const btnSimulateDrop = document.getElementById('btn-simulate-drop');
  const btnModeApp = document.getElementById('mode-app');
  const btnModeSafari = document.getElementById('mode-safari');
  const elModeExplanation = document.getElementById('mode-explanation');

  // Format relative seconds
  function formatRelative(isoDate) {
    if (!isoDate) return 'just now';
    const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 1000));
    if (diffSec < 4) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    return `${hours}h ago`;
  }

  function formatDuration(sec) {
    if (!sec || sec <= 0) return '—';
    if (sec < 60) return `${Math.round(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s ? String(s).padStart(2, '0') + 's' : ''}`;
  }

  function formatTimeOnly(isoDate) {
    try {
      return new Date(isoDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '—';
    }
  }

  // Generate Buy Link for a Model
  function getBuyLink(partNumber, storage, color) {
    if (state.checkoutMode === 'safari') {
      const storageSlug = (storage || '256gb').toLowerCase();
      const colorSlug = (color || 'night-sky').toLowerCase().replace(/\s+/g, '-');
      return `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${storageSlug}-${colorSlug}-unlocked?skipul=1#${partNumber}`;
    }
    return `https://www.apple.com/shop/buy-iphone/iphone-duo`;
  }

  // Play audio chime
  function playDropSound() {
    if (!state.soundEnabled || !elAudio) return;
    try {
      elAudio.currentTime = 0;
      elAudio.play().catch(err => {
        console.warn('Audio play prevented by browser policy:', err);
      });
    } catch (e) {}
  }

  // Show Desktop Notification
  function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%234ade80"/></svg>'
        });
      } catch (e) {
        console.warn('Notification error:', e);
      }
    }
  }

  // Update UI Elements
  function renderState() {
    const availableItems = state.stock.filter(item => item.available);
    const hasDrop = availableItems.length > 0;

    // Connection badge
    elConnectionStatus.textContent = state.isSimulated
      ? `Simulated Drop · ${formatRelative(state.lastSweepAt)}`
      : `Live · ${formatRelative(state.lastSweepAt)}`;

    if (hasDrop) {
      elLiveDot.classList.add('active-drop');
      elStoreMarkerGroup.classList.add('active-stock');
      elPickupCard.classList.add('active-drop-card');
      elStockBadge.className = 'badge in-stock';
      elStockBadge.textContent = 'READY FOR PICKUP';

      elRadarHeadline.textContent = `${availableItems.length} Model${availableItems.length > 1 ? 's' : ''} Lit Up!`;
      elRadarDescription.textContent = `Live stock detected at Apple Cielo Vista Mall right now! Restocks move fast—place your pickup order immediately.`;

      elStockHeadline.textContent = `In Stock at Cielo Vista!`;
      elStockSubtext.textContent = `${availableItems.length} iPhone Duo model${availableItems.length > 1 ? 's are' : ' is'} currently ready for local pickup.`;

      // Populate active drops list
      elActiveDropsContainer.classList.remove('hidden');
      elActiveDropsList.innerHTML = availableItems.map(item => `
        <div class="active-drop-row">
          <div class="drop-item-spec">
            <span class="swatch-sm" style="background:${item.hex}"></span>
            <span>${item.storage} ${item.color}</span>
            <span class="font-mono text-star-faint" style="font-size:11px">${item.price}</span>
          </div>
          <a href="${getBuyLink(item.part_number, item.storage, item.color)}" target="_blank" rel="noopener" class="btn-buy-instant">
            ${state.checkoutMode === 'safari' ? 'Buy ⚡' : 'Buy Now'}
          </a>
        </div>
      `).join('');
    } else {
      elLiveDot.classList.remove('active-drop');
      elStoreMarkerGroup.classList.remove('active-stock');
      elPickupCard.classList.remove('active-drop-card');
      elStockBadge.className = 'badge';
      elStockBadge.textContent = 'Sold Out';

      elRadarHeadline.textContent = 'Scanning El Paso…';
      elRadarDescription.textContent = 'Tracking in-store pickup drops at 8401 Gateway Blvd W, updated every 30 seconds directly from Apple.';

      elStockHeadline.textContent = 'Nothing on the shelves.';
      elStockSubtext.textContent = 'All 8 models are currently out of stock for local pickup in El Paso. The radar is pinging Apple every 30 seconds.';

      elActiveDropsContainer.classList.add('hidden');
      elActiveDropsList.innerHTML = '';
    }

    renderModelsGrid();
  }

  // Render Models Matrix
  function renderModelsGrid() {
    const filtered = state.stock.filter(item => {
      if (state.filterStorage === 'all') return true;
      return item.storage === state.filterStorage;
    });

    elModelsGrid.innerHTML = filtered.map(item => {
      const isAvail = item.available;
      const buyUrl = getBuyLink(item.part_number, item.storage, item.color);

      return `
        <div class="model-card ${isAvail ? 'in-stock' : ''}">
          <div>
            <div class="model-top">
              <span class="model-swatch" style="background:${item.hex}"></span>
              <span class="model-sku">${item.part_number}</span>
            </div>
            <h3 class="model-name">${item.storage}</h3>
            <p class="model-finish">${item.color}</p>
            <p class="model-price">${item.price}</p>
          </div>
          <div class="model-footer">
            <span class="stock-tag ${isAvail ? 'tag-available' : ''}">
              ${isAvail ? '● READY FOR PICKUP' : 'Sold Out'}
            </span>
            <a href="${buyUrl}" target="_blank" rel="noopener" class="btn-card-buy ${isAvail ? '' : 'disabled'}">
              ${state.checkoutMode === 'safari' ? 'Buy ⚡' : 'Buy'}
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Restock History & Hourly Chart
  function renderHistory() {
    if (!state.stats) return;

    if (state.stats.median_s) {
      elMedianDur.textContent = `~${formatDuration(state.stats.median_s)}`;
    }

    elTotalDropsBadge.textContent = `${state.events.length} drop${state.events.length === 1 ? '' : 's'} logged`;

    // Render 24-hour bars
    const byHour = state.stats.byHour || Array(24).fill(0);
    const maxVal = Math.max(1, ...byHour);

    elHourlyBars.innerHTML = byHour.map((count, hour) => {
      const pct = Math.max(5, (count / maxVal) * 100);
      const isPeak = count === maxVal && count > 0;
      const hourLabel = `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;

      return `
        <div class="bar-col" title="${hourLabel} MT: ${count} drops">
          <div class="bar-fill ${count > 0 ? 'has-drops' : ''} ${isPeak ? 'peak' : ''}" style="height:${pct}%"></div>
        </div>
      `;
    }).join('');

    // Render Drop Logs Table
    if (state.events.length === 0) {
      elDropLogsBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding: 24px; color: var(--star-faint)">
            No restock drops recorded yet today.
          </td>
        </tr>
      `;
      return;
    }

    elDropLogsBody.innerHTML = state.events.slice(0, 8).map(ev => {
      const prod = state.products.find(p => p.part === ev.part_number);
      const isLive = !ev.ended_at;
      let durationStr = 'LIVE NOW ⚡';
      if (!isLive) {
        const sec = (Date.parse(ev.ended_at) - Date.parse(ev.started_at)) / 1000;
        durationStr = `lasted ${formatDuration(sec)}`;
      }

      return `
        <tr>
          <td class="time-col">${formatTimeOnly(ev.started_at)}</td>
          <td class="model-col">${prod ? `${prod.storage} ${prod.color}` : ev.part_number}</td>
          <td>Cielo Vista Mall</td>
          <td class="dur-col ${isLive ? 'dur-live' : ''}">${durationStr}</td>
        </tr>
      `;
    }).join('');
  }

  // Fetch /api/state
  async function fetchState() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      state.store = data.store;
      state.products = data.products || [];
      state.stock = data.stock || [];
      state.isSimulated = !!data.is_simulated;
      state.lastSweepAt = data.status?.last_sweep_at || new Date().toISOString();

      // Sync interval and ntfy topic settings to UI
      if (data.status?.sweep_interval_s) {
        const intervalEl = document.getElementById('metric-check-frequency');
        if (intervalEl) intervalEl.textContent = `Every ${data.status.sweep_interval_s}s`;
      }
      if (data.settings?.ntfy_topic) {
        const topicInput = document.getElementById('input-ntfy-topic');
        if (topicInput && !topicInput.dataset.touched) {
          topicInput.value = data.settings.ntfy_topic;
        }
      }
      if (data.settings?.alert_storages) {
        const activeStorages = data.settings.alert_storages;
        document.querySelectorAll('#alert-storage-pills .pill-toggle').forEach(pill => {
          const s = pill.dataset.storage;
          const isActive = (s === 'all' && activeStorages.includes('all')) || activeStorages.includes(s);
          pill.classList.toggle('active', isActive);
          if (s !== 'all') {
            pill.textContent = isActive ? `${s} (Active)` : s;
          }
        });
        const tipEl = document.getElementById('filter-tip-text');
        if (tipEl) {
          tipEl.textContent = activeStorages.includes('all')
            ? 'Filtering: All models will alert your phone.'
            : `Filtering: Only ${activeStorages.join(', ')} Star White & Night Sky will ping your phone.`;
        }
      }

      // Detect restock drop triggers for sounds & notifications
      if (state.initialized) {
        for (const item of state.stock) {
          const wasAvail = !!state.previousStock[item.part_number];
          if (item.available && !wasAvail) {
            playDropSound();
            showNotification(
              '⚡ iPhone Duo Restock in El Paso!',
              `New drop at Apple Cielo Vista Mall: ${item.storage} ${item.color} ready for pickup now!`
            );
          }
        }
      }

      // Update previous map
      for (const item of state.stock) {
        state.previousStock[item.part_number] = item.available;
      }
      state.initialized = true;

      renderState();
    } catch (err) {
      console.warn('Failed to fetch state:', err.message);
      elConnectionStatus.textContent = 'Reconnecting…';
    }
  }

  // Fetch /api/history
  async function fetchHistory() {
    try {
      const res = await fetch('/api/history', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      state.events = data.events || [];
      state.stats = data.stats || null;
      renderHistory();
    } catch (err) {
      console.warn('Failed to fetch history:', err.message);
    }
  }

  // Wire Event Listeners
  function setupEventListeners() {
    // Storage filter pills
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterStorage = btn.dataset.filter;
        renderModelsGrid();
      });
    });

    // Sound Toggle
    btnToggleSound.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem('ep_sound_enabled', state.soundEnabled);
      document.getElementById('sound-icon').textContent = state.soundEnabled ? '🔊' : '🔇';
      document.getElementById('sound-label').textContent = `Audio Alert: ${state.soundEnabled ? 'ON' : 'OFF'}`;
      if (state.soundEnabled) playDropSound();
    });

    // Test Sound Chime
    btnTestChime.addEventListener('click', () => {
      playDropSound();
    });

    // Push Notification Toggle
    btnTogglePush.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        alert('This browser does not support web notifications.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        document.getElementById('push-label').textContent = 'Notifications Enabled ✓';
        showNotification('Radar Alerts Armed', 'You will receive immediate alerts when iPhone Duo restocks in El Paso.');
      } else {
        alert('Notifications were blocked. Please enable them in your browser site permissions.');
      }
    });

    // Simulate Drop (Test button)
    btnSimulateDrop.addEventListener('click', async () => {
      btnSimulateDrop.disabled = true;
      btnSimulateDrop.textContent = '⚡ Simulating Drop…';
      try {
        await fetch('/api/simulate-drop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ part: 'MK1F4LL/A' }) // 256GB Night Sky
        });
        await fetchState();
        await fetchHistory();
      } catch (e) {
        console.error(e);
      } finally {
        setTimeout(() => {
          btnSimulateDrop.disabled = false;
          btnSimulateDrop.textContent = '⚡ Trigger Test Drop (Simulation)';
        }, 3000);
      }
    });

    // Checkout Modes
    btnModeApp.addEventListener('click', () => {
      state.checkoutMode = 'app';
      localStorage.setItem('ep_checkout_mode', 'app');
      btnModeApp.classList.add('active');
      btnModeSafari.classList.remove('active');
      elModeExplanation.textContent = 'Recommended: Opens the Apple Store app directly where you are already authenticated with Face ID / Apple Pay.';
      renderState();
    });

    btnModeSafari.addEventListener('click', () => {
      state.checkoutMode = 'safari';
      localStorage.setItem('ep_checkout_mode', 'safari');
      btnModeSafari.classList.add('active');
      btnModeApp.classList.remove('active');
      elModeExplanation.textContent = 'Safari ⚡ mode: Bypasses product configuration and adds the exact dropped SKU straight into your bag in one tap.';
      renderState();
    });

    // Set initial mode button state
    if (state.checkoutMode === 'safari') {
      btnModeSafari.classList.add('active');
      btnModeApp.classList.remove('active');
    }

    // Phone Push Notifications (ntfy & cloud setup)
    const inputNtfyTopic = document.getElementById('input-ntfy-topic');
    const btnSaveTopic = document.getElementById('btn-save-topic');
    const btnTestPhone = document.getElementById('btn-test-phone');
    const elPhoneTestStatus = document.getElementById('phone-test-status');

    if (inputNtfyTopic) {
      inputNtfyTopic.addEventListener('input', () => {
        inputNtfyTopic.dataset.touched = 'true';
      });
    }

    if (btnSaveTopic && inputNtfyTopic) {
      btnSaveTopic.addEventListener('click', async () => {
        const topic = inputNtfyTopic.value.trim();
        if (!topic) return;
        btnSaveTopic.disabled = true;
        btnSaveTopic.textContent = 'Saving…';
        try {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ntfy_topic: topic })
          });
          btnSaveTopic.textContent = 'Saved ✓';
          setTimeout(() => {
            btnSaveTopic.textContent = 'Save';
            btnSaveTopic.disabled = false;
          }, 2000);
        } catch (e) {
          btnSaveTopic.textContent = 'Error';
          setTimeout(() => {
            btnSaveTopic.textContent = 'Save';
            btnSaveTopic.disabled = false;
          }, 2000);
        }
      });
    }

    if (btnTestPhone) {
      btnTestPhone.addEventListener('click', async () => {
        btnTestPhone.disabled = true;
        btnTestPhone.innerHTML = '<span>📱 Sending Test Alert…</span>';
        if (elPhoneTestStatus) {
          elPhoneTestStatus.className = 'test-status-msg';
          elPhoneTestStatus.textContent = 'Sending test notification to phone pipeline…';
          elPhoneTestStatus.classList.remove('hidden');
        }

        try {
          const res = await fetch('/api/test-phone-notification', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            if (elPhoneTestStatus) {
              elPhoneTestStatus.className = 'test-status-msg test-success';
              elPhoneTestStatus.innerHTML = `✓ Dispatched to <strong>ntfy.sh/${data.topic}</strong>! Open the ntfy app on your phone to confirm receipt.`;
            }
          } else {
            throw new Error(data.error || 'Failed');
          }
        } catch (err) {
          if (elPhoneTestStatus) {
            elPhoneTestStatus.className = 'test-status-msg test-error';
            elPhoneTestStatus.textContent = `Error dispatching test alert: ${err.message}`;
          }
        } finally {
          setTimeout(() => {
            btnTestPhone.disabled = false;
            btnTestPhone.innerHTML = '<span>📱 Send Test Alert to Phone</span>';
          }, 3500);
        }
      });
    }

    // Storage Alert Filter Pills
    document.querySelectorAll('#alert-storage-pills .pill-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chosen = btn.dataset.storage;
        const targetList = chosen === 'all' ? ['all'] : [chosen];

        document.querySelectorAll('#alert-storage-pills .pill-toggle').forEach(p => {
          p.classList.toggle('active', p === btn);
          if (p.dataset.storage !== 'all') {
            p.textContent = p === btn ? `${p.dataset.storage} (Active)` : p.dataset.storage;
          }
        });

        const tipEl = document.getElementById('filter-tip-text');
        if (tipEl) {
          tipEl.textContent = chosen === 'all'
            ? 'Filtering: All models will alert your phone.'
            : `Filtering: Only ${chosen} Star White & Night Sky will ping your phone.`;
        }

        try {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_storages: targetList })
          });
        } catch (e) {
          console.warn('Could not save storage filter:', e);
        }
      });
    });
  }

  // Initialize
  setupEventListeners();
  fetchState();
  fetchHistory();

  // Polling loops
  setInterval(fetchState, 3500);
  setInterval(fetchHistory, 15000);
})();
