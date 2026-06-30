// app.js — orchestrates the BLE Range Logger web app.
//
// Wires the GeolocationManager, BluetoothManager and SessionLogger to the UI,
// runs the periodic snapshot loop, keeps the screen awake during a session,
// and registers the service worker for offline / add-to-home-screen use.

import { GeolocationManager } from './geo.js';
import { BluetoothManager } from './ble.js';
import { SessionLogger } from './logger.js';
import { CompassManager } from './compass.js';

const geo = new GeolocationManager();
const ble = new BluetoothManager();
const logger = new SessionLogger();
const compass = new CompassManager();

let snapshotTimer = null;
let wakeLock = null;
let gpsSource = 'internal';
let sessionActive = false;
let motionEnabled = false;

const $ = (id) => document.getElementById(id);

function fmt(v, digits) {
  if (
    v === '' ||
    v === null ||
    v === undefined ||
    (typeof v === 'number' && Number.isNaN(v))
  ) {
    return '—';
  }
  return typeof v === 'number' && digits != null ? v.toFixed(digits) : String(v);
}

function showBanner(msg, kind) {
  const b = $('compat-banner');
  b.textContent = msg;
  b.className = 'banner ' + (kind || 'info');
  b.hidden = false;
}

function refreshStatus() {
  const g = geo.latest();
  $('ble-state').textContent = ble.state;
  $('ble-state').className = 'value state-' + ble.state;
  const badge = $('ble-badge');
  badge.textContent = ble.state;
  badge.className = 'badge badge-' + ble.state;
  $('device-name').textContent = ble.deviceName || '— none selected —';
  $('rssi').textContent = ble.rssi === '' ? '—' : `${ble.rssi} dBm`;
  if (ble.note) {
    $('ble-note').textContent = ble.note;
    $('ble-note').classList.add('note-warn');
  }
  $('lat').textContent = fmt(g.latitude, 6);
  $('lon').textContent = fmt(g.longitude, 6);
  $('acc').textContent = g.accuracy === '' ? '—' : `${fmt(g.accuracy, 1)} m`;
  $('alt').textContent = g.altitude === '' ? '—' : `${fmt(g.altitude, 1)} m`;
  $('speed').textContent = g.speed === '' ? '—' : `${fmt(g.speed, 1)} m/s`;
  $('row-count').textContent = String(logger.rowCount);
  updateButtons();
}

// Update the compass needle + attitude indicator + numeric orientation values.
function renderOrientation(o) {
  const h = o || compass.latest();
  // Compass needle points toward the heading (clockwise from north/up).
  if (h.heading !== '') {
    $('compass-needle').setAttribute('transform', `rotate(${h.heading} 70 70)`);
    $('heading-val').textContent = `${fmt(h.heading, 0)}° ${CompassManager.cardinal(h.heading)}`;
  }
  // Attitude: horizon shifts with pitch (beta) and banks with roll (gamma).
  if (h.beta !== '' || h.gamma !== '') {
    const pitchPx = Math.max(-55, Math.min(55, (h.beta || 0) * 1.4));
    const roll = h.gamma || 0;
    $('attitude-horizon').setAttribute(
      'transform',
      `rotate(${roll} 70 70) translate(0 ${pitchPx})`
    );
    $('pitch-val').textContent = `${fmt(h.beta, 0)}°`;
    $('roll-val').textContent = `${fmt(h.gamma, 0)}°`;
  }
}

function appendPreview() {
  const last = logger.rows.slice(-8).reverse();
  const lines = last.map((r) => {
    const t = (r.timestamp_iso.split('T')[1] || '').replace('Z', '');
    return `${t}  ${r.event_type}  ${r.ble_state || '-'}  rssi=${
      r.rssi_dbm || '-'
    }  hdg=${r.compass_heading_deg !== '' ? Math.round(r.compass_heading_deg) : '-'}`;
  });
  $('log-preview').textContent = lines.join('\n') || 'No rows yet.';
}

function logRow(eventType) {
  logger.add({
    eventType,
    bleState: ble.state,
    rssi: ble.rssi,
    geo: geo.latest(),
    gpsSource,
    compass: compass.latest()
  });
  refreshStatus();
  appendPreview();
}

function getSnapshotIntervalMs() {
  const v = parseFloat($('input-interval').value);
  return (isFinite(v) && v >= 0.2 ? v : 1) * 1000;
}

// Request motion/orientation permission (iOS needs a user gesture) and start
// live compass updates. Safe to call multiple times.
async function ensureMotion() {
  if (motionEnabled) return true;
  try {
    const granted = await compass.requestPermission();
    if (!granted) {
      showBanner('Motion & Orientation permission was denied — heading/tilt will be blank.', 'warn');
      return false;
    }
  } catch {
    // Some platforms throw if not in a user gesture; ignore and try to start.
  }
  compass.setOnChange(renderOrientation);
  compass.start();
  motionEnabled = true;
  $('btn-motion').textContent = 'On';
  $('btn-motion').disabled = true;
  return true;
}

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch {
    // Wake Lock unsupported or denied — non-fatal.
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    // ignore
  }
}

async function startSession() {
  if (sessionActive) return;
  sessionActive = true;
  logger.start();
  geo.start({
    onUpdate: () => refreshStatus(),
    onError: (e) =>
      showBanner('GPS error: ' + (e && e.message ? e.message : e), 'warn')
  });
  await ensureMotion();
  logRow('session_start');
  snapshotTimer = setInterval(() => {
    if (sessionActive) logRow('snapshot');
  }, getSnapshotIntervalMs());
  await acquireWakeLock();
  $('rec-badge').textContent = 'recording';
  $('rec-badge').className = 'badge badge-connected';
  updateButtons();
}

async function stopSession() {
  if (!sessionActive) return;
  logRow('session_end');
  sessionActive = false;
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  geo.stop();
  logger.stop();
  await releaseWakeLock();
  $('rec-badge').textContent = 'idle';
  $('rec-badge').className = 'badge';
  updateButtons();
}

function updateButtons() {
  $('btn-start').disabled = sessionActive;
  $('btn-stop').disabled = !sessionActive;
  $('btn-export').disabled = sessionActive || logger.rowCount === 0;
  $('btn-select').disabled = !ble.available;
}

ble.setHandlers({
  onStateChange: () => refreshStatus(),
  onEvent: () => {
    if (sessionActive) logRow('ble_event');
    else refreshStatus();
  }
});

$('btn-select').addEventListener('click', async () => {
  await ensureMotion(); // piggyback the gesture to enable orientation early
  try {
    await ble.selectDevice();
    await ble.connect();
    refreshStatus();
  } catch (e) {
    refreshStatus(); // surfaces ble.note diagnostics
    showBanner('Bluetooth: ' + (e && e.message ? e.message : e), 'warn');
  }
});
$('btn-motion').addEventListener('click', ensureMotion);
$('btn-start').addEventListener('click', startSession);
$('btn-stop').addEventListener('click', stopSession);
$('btn-export').addEventListener('click', () => logger.export());
$('toggle-gps-source').addEventListener('change', (e) => {
  gpsSource = e.target.checked ? 'external' : 'internal';
  $('gps-source-label').textContent = gpsSource;
});

document.addEventListener('visibilitychange', async () => {
  if (sessionActive && document.visibilityState === 'visible' && !wakeLock) {
    await acquireWakeLock();
  }
});

function initCompat() {
  if (!window.isSecureContext) {
    showBanner(
      'Serve this page over HTTPS (e.g. GitHub Pages) — Bluetooth and GPS need a secure context.',
      'warn'
    );
  } else if (!ble.available) {
    showBanner(
      'Web Bluetooth not available here — GPS-only mode. For BLE on iPhone, open this page in the Bluefy browser.',
      'warn'
    );
  }
  if (!geo.available) {
    showBanner('Geolocation is not available in this browser.', 'warn');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

refreshStatus();
appendPreview();
initCompat();
