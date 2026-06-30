// SessionLogger — builds CSV rows from combined BLE + GPS state.
//
// Responsibility: hold rows in memory, format them as CSV using the shared
// schema, and export the file (iOS share sheet when available, else download).
// The schema matches the native app so logs are interchangeable.

const CSV_HEADER = [
  'timestamp_iso',
  'event_type',
  'ble_state',
  'rssi_dbm',
  'latitude',
  'longitude',
  'horizontal_accuracy_m',
  'altitude_m',
  'vertical_accuracy_m',
  'speed_mps',
  'gps_source',
  'compass_heading_deg',
  'compass_accuracy_deg',
  'orientation_alpha_deg',
  'orientation_beta_deg',
  'orientation_gamma_deg',
  'ref_relative_angle_deg',
  'ref_distance_m'
];

export class SessionLogger {
  constructor() {
    this._rows = [];
    this.running = false;
  }

  get rowCount() {
    return this._rows.length;
  }

  get rows() {
    return this._rows;
  }

  start() {
    this._rows = [];
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  // { eventType, bleState, rssi, geo: {latitude,...}, gpsSource, compass: {heading,...}, reference: {relAngle, distance} }
  add({ eventType, bleState, rssi, geo, gpsSource, compass, reference }) {
    const g = geo || {};
    const c = compass || {};
    const r = reference || {};
    const blank = (v) => (v === '' || v === null || v === undefined ? '' : v);
    this._rows.push({
      timestamp_iso: new Date().toISOString(),
      event_type: eventType,
      ble_state: bleState ?? '',
      rssi_dbm: blank(rssi),
      latitude: g.latitude ?? '',
      longitude: g.longitude ?? '',
      horizontal_accuracy_m: g.accuracy ?? '',
      altitude_m: g.altitude ?? '',
      vertical_accuracy_m: g.altitudeAccuracy ?? '',
      speed_mps: g.speed ?? '',
      gps_source: gpsSource ?? 'internal',
      compass_heading_deg: blank(c.heading),
      compass_accuracy_deg: blank(c.accuracy),
      orientation_alpha_deg: blank(c.alpha),
      orientation_beta_deg: blank(c.beta),
      orientation_gamma_deg: blank(c.gamma),
      ref_relative_angle_deg: blank(r.relAngle),
      ref_distance_m: blank(r.distance)
    });
  }

  toCSV() {
    const escape = (v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [CSV_HEADER.join(',')];
    for (const r of this._rows) {
      lines.push(CSV_HEADER.map((k) => escape(r[k])).join(','));
    }
    return lines.join('\n');
  }

  filename() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `ble-range-${ts}.csv`;
  }

  async export() {
    const csv = this.toCSV();
    const name = this.filename();
    const blob = new Blob([csv], { type: 'text/csv' });

    // Prefer the iOS share sheet so the user can Save to Files / AirDrop / mail.
    try {
      const file = new File([blob], name, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      // Share cancelled or unavailable — fall back to a download.
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
