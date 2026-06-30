// ReferenceManager — angle relative to a user-defined reference line.
//
// The user marks a CENTER point and a 0° REFERENCE point (both GPS fixes).
// The line center -> reference defines 0°. Then for the current location we
// compute the angle off that line (positive = clockwise / right of the line)
// and the distance from the center. This helps the user walk/stay on a chosen
// bearing during range testing.

export class ReferenceManager {
  constructor() {
    this.center = null; // { lat, lon }
    this.refPoint = null; // { lat, lon }
    this.refBearing = null; // degrees from center to refPoint (0..360)
  }

  // Accepts a geo snapshot ({ latitude, longitude, ... }); returns true if stored.
  setCenter(geo) {
    const p = ReferenceManager._point(geo);
    if (!p) return false;
    this.center = p;
    this._recompute();
    return true;
  }

  setReference(geo) {
    const p = ReferenceManager._point(geo);
    if (!p) return false;
    this.refPoint = p;
    this._recompute();
    return true;
  }

  reset() {
    this.center = null;
    this.refPoint = null;
    this.refBearing = null;
  }

  get ready() {
    return this.center != null && this.refBearing != null;
  }

  _recompute() {
    this.refBearing =
      this.center && this.refPoint
        ? ReferenceManager.bearing(this.center, this.refPoint)
        : null;
  }

  // Returns { relAngle, distance, bearing } or null if not ready / no fix.
  compute(geo) {
    const cur = ReferenceManager._point(geo);
    if (!this.ready || !cur) return null;
    const distance = ReferenceManager.distance(this.center, cur);
    const bearing = ReferenceManager.bearing(this.center, cur);
    // Normalize to -180..180; positive = clockwise (right) of reference line.
    const relAngle = ((bearing - this.refBearing + 540) % 360) - 180;
    return { relAngle, distance, bearing };
  }

  static _point(geo) {
    if (!geo) return null;
    const lat = geo.latitude;
    const lon = geo.longitude;
    if (lat === '' || lon === '' || lat == null || lon == null) return null;
    if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return null;
    return { lat: Number(lat), lon: Number(lon) };
  }

  // Initial bearing from a to b, degrees 0..360 (0 = north, 90 = east).
  static bearing(a, b) {
    const toRad = Math.PI / 180;
    const f1 = a.lat * toRad;
    const f2 = b.lat * toRad;
    const dL = (b.lon - a.lon) * toRad;
    const y = Math.sin(dL) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dL);
    return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
  }

  // Haversine distance in meters.
  static distance(a, b) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const f1 = a.lat * toRad;
    const f2 = b.lat * toRad;
    const dF = (b.lat - a.lat) * toRad;
    const dL = (b.lon - a.lon) * toRad;
    const h =
      Math.sin(dF / 2) ** 2 +
      Math.cos(f1) * Math.cos(f2) * Math.sin(dL / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
}
