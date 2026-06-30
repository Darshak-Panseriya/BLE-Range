// BluetoothManager — wraps the Web Bluetooth API (where available).
//
// Responsibility: select a BLE device, maintain a GATT connection, emit
// connect/disconnect events, auto-reconnect when the device returns, and
// best-effort RSSI sampling.
//
// IMPORTANT: Reliable RSSI is NOT part of the Web Bluetooth standard. There is
// no readRSSI() for a connected device. We attempt advertisement RSSI via
// watchAdvertisements(), which is experimental and often unavailable on iOS.
// For dependable RSSI vs distance, use the native app. See README.

export class BluetoothManager {
  constructor() {
    this.available = 'bluetooth' in navigator;
    this._device = null;
    this._server = null;
    this.state = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.deviceName = '';
    this.rssi = ''; // latest advertisement RSSI (best-effort) or ''
    this.note = ''; // human-readable diagnostic for the UI
    this._onStateChange = null;
    this._onEvent = null;
    this._reconnectTimer = null;
    this._wantConnected = false;
    this._advWatching = false;
    this._connectedAt = 0;
  }

  setHandlers({ onStateChange, onEvent } = {}) {
    this._onStateChange = onStateChange || null;
    this._onEvent = onEvent || null;
  }

  _setState(state) {
    this.state = state;
    if (this._onStateChange) this._onStateChange(state, this.deviceName);
  }

  // Must be called from a user gesture (e.g. a button click).
  async selectDevice() {
    if (!this.available) {
      throw new Error('Web Bluetooth not supported in this browser');
    }
    this._device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [] // only connect/disconnect needed; no GATT services
    });
    this.deviceName = this._device.name || this._device.id || 'Unknown device';
    this._device.addEventListener('gattserverdisconnected', () =>
      this._handleDisconnect()
    );
    return this.deviceName;
  }

  // Wraps gatt.connect() with a timeout so it never hangs indefinitely.
  _connectWithTimeout(timeoutMs = 12000) {
    const connectPromise = this._device.gatt.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('connect timeout')), timeoutMs)
    );
    return Promise.race([connectPromise, timeoutPromise]);
  }

  async connect() {
    if (!this._device) throw new Error('No device selected');
    this._wantConnected = true;
    this.note = '';
    this._setState('connecting');
    try {
      this._server = await this._connectWithTimeout();
      this._connectedAt = Date.now();
      this._setState('connected');
      if (this._onEvent) this._onEvent('ble_event', 'connected');
      this._startAdvertisementWatch();
    } catch (e) {
      this.note =
        'Could not open a BLE (GATT) connection. Audio devices like ' +
        'headphones/speakers use Classic Bluetooth and cannot be tracked here — ' +
        'use a BLE peripheral (sensor, beacon, tag, ESP32/nRF).';
      this._setState('disconnected');
      this._scheduleReconnect();
      throw e;
    }
  }

  disconnect() {
    this._wantConnected = false;
    this._clearReconnect();
    if (this._device && this._device.gatt && this._device.gatt.connected) {
      this._device.gatt.disconnect();
    } else {
      this._setState('disconnected');
    }
  }

  _handleDisconnect() {
    // If the link dropped within ~2 s of connecting, it is almost certainly an
    // audio/Classic-Bluetooth device that does not keep a connectable GATT link.
    if (this._connectedAt && Date.now() - this._connectedAt < 2000) {
      this.note =
        'Device connected then dropped immediately — typical of headphones/' +
        'speakers (Classic Bluetooth audio). Use a BLE peripheral for range testing.';
    }
    this._connectedAt = 0;
    this._setState('disconnected');
    if (this._onEvent) this._onEvent('ble_event', 'disconnected');
    if (this._wantConnected) this._scheduleReconnect();
  }

  _scheduleReconnect() {
    this._clearReconnect();
    if (!this._wantConnected) return;
    this._reconnectTimer = setTimeout(async () => {
      if (!this._wantConnected || !this._device) return;
      try {
        // Reconnect silently in the background — state stays 'disconnected'
        // until it actually succeeds, so events stay clean.
        this._server = await this._connectWithTimeout();
        this._connectedAt = Date.now();
        this._setState('connected');
        if (this._onEvent) this._onEvent('ble_event', 'connected');
        this._startAdvertisementWatch();
      } catch {
        this._scheduleReconnect();
      }
    }, 3000);
  }

  _clearReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // Best-effort RSSI via advertisements. Experimental; non-fatal on failure.
  async _startAdvertisementWatch() {
    if (this._advWatching) return;
    if (typeof this._device.watchAdvertisements !== 'function') return;
    try {
      this._device.addEventListener('advertisementreceived', (event) => {
        if (typeof event.rssi === 'number') this.rssi = event.rssi;
      });
      await this._device.watchAdvertisements();
      this._advWatching = true;
    } catch {
      // RSSI simply stays unavailable on this platform.
    }
  }
}
