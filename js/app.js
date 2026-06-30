// app.js — orchestrates the BLE Range Logger web app.
//
// Wires the GeolocationManager, BluetoothManager and SessionLogger to the UI,
// runs the periodic snapshot loop, keeps the screen awake during a session,
// and registers the service worker for offline / add-to-home-screen use.

import { GeolocationManager } from './geo.js';
import { BluetoothManager } from './ble.js';
import { SessionLogger } from './logger.js';
import { CompassManager } from './compass.js';
import { ReferenceManager } from './reference.js';

const geo = new GeolocationManager();
const ble = new BluetoothManager();
const logger = new SessionLogger();
const compass = new CompassManager();
const ref = new ReferenceManager();

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
  renderReference();
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

function getTolerance() {
  const v = parseFloat($('ref-tolerance').value);
  return isFinite(v) && v >= 1 ? v : 5;
}

// Build an SVG wedge path centered on centerDeg, spanning ±halfDeg, at radius.
// 0° points up (negative Y); positive angle is clockwise (to the right).
function wedgePath(centerDeg, halfDeg, radius) {
  const cx = 80;
  const cy = 80;
  const a1 = ((centerDeg - halfDeg) * Math.PI) / 180;
  const a2 = ((centerDeg + halfDeg) * Math.PI) / 180;
  const x1 = cx + radius * Math.sin(a1);
  const y1 = cy - radius * Math.cos(a1);
  const x2 = cx + radius * Math.sin(a2);
  const y2 = cy - radius * Math.cos(a2);
  const largeArc = halfDeg * 2 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
}

// Draw the green "on-track" wedge (±tolerance around the 0° line).
function updateZone() {
  $('ref-zone').setAttribute('d', wedgePath(0, getTolerance(), 68));
}

// Map angular uncertainty (deg) to a confidence label + colour class.
function confidence(u) {
  if (u == null) return { text: 'angle accuracy: waiting for GPS', cls: '' };
  if (u <= 3) return { text: `± ${u.toFixed(1)}° · high confidence`, cls: 'conf-high' };
  if (u <= 10) return { text: `± ${u.toFixed(1)}° · medium confidence`, cls: 'conf-med' };
  return { text: `± ${u.toFixed(1)}° · low — move further from center`, cls: 'conf-low' };
}

// Update the reference circular map and numeric angle/distance/accuracy.
function renderReference() {
  const badge = $('ref-badge');
  if (!ref.center) {
    badge.textContent = 'set center';
    badge.className = 'badge';
  } else if (!ref.ready) {
    badge.textContent = 'set 0° line';
    badge.className = 'badge badge-connecting';
  } else {
    badge.textContent = 'ready';
    badge.className = 'badge badge-connected';
  }
  const data = ref.compute(geo.latest());
  if (!data) {
    $('ref-angle-val').textContent = '—';
    $('ref-dist-val').textContent = '—';
    $('ref-conf').textContent = 'angle accuracy: —';
    $('ref-conf').className = 'viz-cap ref-conf';
    $('ref-uncertainty').setAttribute('d', '');
    return;
  }
  const tol = getTolerance();
  const onTrack = Math.abs(data.relAngle) <= tol;
  const needle = $('ref-needle');
  needle.setAttribute('transform', `rotate(${data.relAngle.toFixed(1)} 80 80)`);
  needle.classList.toggle('on-track', onTrack);
  needle.classList.toggle('off-track', !onTrack);
  const sign = data.relAngle > 0 ? '+' : '';
  $('ref-angle-val').textContent = `${sign}${fmt(data.relAngle, 0)}°`;
  $('ref-dist-val').textContent = `${fmt(data.distance, 1)} m`;

  // Angular-uncertainty fan around the needle + confidence text.
  if (data.uncertainty != null) {
    $('ref-uncertainty').setAttribute(
      'd',
      wedgePath(data.relAngle, Math.min(90, data.uncertainty), 62)
    );
  } else {
    $('ref-uncertainty').setAttribute('d', '');
  }
  const c = confidence(data.uncertainty);
  $('ref-conf').textContent = c.text;
  $('ref-conf').className = 'viz-cap ref-conf ' + c.cls;
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
    compass: compass.latest(),
    reference: ref.compute(geo.latest())
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
  compass.stop();
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
$('btn-set-center').addEventListener('click', () => {
  if (ref.setCenter(geo.latest())) renderReference();
  else showBanner('No GPS fix yet — wait for a location, then set the center.', 'warn');
});
$('btn-set-ref').addEventListener('click', () => {
  if (!ref.center) {
    showBanner('Set the center first, then walk out and set the 0° line.', 'warn');
    return;
  }
  if (ref.setReference(geo.latest())) renderReference();
  else showBanner('No GPS fix yet — wait for a location, then set the 0° line.', 'warn');
});
$('btn-ref-reset').addEventListener('click', () => {
  ref.reset();
  renderReference();
});
$('ref-tolerance').addEventListener('input', () => {
  updateZone();
  renderReference();
});
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
updateZone();

// Pick-once: if the user already granted a BLE device on a previous visit,
// reconnect to it automatically without showing the chooser again.
ble.tryKnownDevice().then((tried) => {
  if (tried) refreshStatus();
});
