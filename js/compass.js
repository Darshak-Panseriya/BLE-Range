// CompassManager — wraps DeviceOrientationEvent for compass heading and full
// device orientation (gyro/accelerometer-derived angles).
//
// On iOS, webkitCompassHeading gives absolute magnetic north (0° = N, 90° = E)
// with webkitCompassAccuracy in degrees. The DeviceOrientationEvent also exposes:
//   alpha (0-360)  : yaw / rotation around Z (relative to app start on iOS)
//   beta  (-180..180): pitch / front-back tilt around X
//   gamma (-90..90)  : roll / left-right tilt around Y
// Together heading + beta + gamma describe the complete phone orientation.
// iOS 13+ requires explicit permission via DeviceOrientationEvent.requestPermission()
// which must be called from a user gesture.

export class CompassManager {
  constructor() {
    this._heading = '';    // absolute magnetic heading (0-360) or ''
    this._accuracy = '';   // heading accuracy in degrees or ''
    this._alpha = '';      // yaw (0-360) or ''
    this._beta = '';       // pitch (-180..180) or ''
    this._gamma = '';      // roll (-90..90) or ''
    this._listening = false;
    this._onChange = null;
    this.available =
      typeof DeviceOrientationEvent !== 'undefined' &&
      ('webkitCompassHeading' in DeviceOrientationEvent.prototype ||
        'alpha' in DeviceOrientationEvent.prototype ||
        true); // can't reliably feature-detect on all browsers; we try anyway
  }

  // Must be called from a user gesture on iOS (button click).
  async requestPermission() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const result = await DeviceOrientationEvent.requestPermission();
      return result === 'granted';
    }
    return true; // no permission gate on this platform
  }

  // Register a callback fired on every orientation event (for live visuals).
  setOnChange(cb) {
    this._onChange = cb || null;
  }

  start() {
    if (this._listening) return;
    this._listener = (event) => {
      // Full orientation angles (available on most platforms).
      if (typeof event.alpha === 'number') this._alpha = event.alpha;
      if (typeof event.beta === 'number') this._beta = event.beta;
      if (typeof event.gamma === 'number') this._gamma = event.gamma;

      // iOS: webkitCompassHeading is absolute degrees from magnetic north.
      if (typeof event.webkitCompassHeading === 'number') {
        this._heading = event.webkitCompassHeading;
        this._accuracy =
          typeof event.webkitCompassAccuracy === 'number'
            ? event.webkitCompassAccuracy
            : '';
      } else if (typeof event.alpha === 'number' && event.absolute) {
        // Non-iOS with absolute orientation: derive heading from alpha.
        this._heading = (360 - event.alpha) % 360;
        this._accuracy = '';
      }
      if (this._onChange) this._onChange(this.latest());
    };
    window.addEventListener('deviceorientation', this._listener, true);
    this._listening = true;
  }

  stop() {
    if (this._listening && this._listener) {
      window.removeEventListener('deviceorientation', this._listener, true);
      this._listening = false;
    }
  }

  latest() {
    return {
      heading: this._heading,
      accuracy: this._accuracy,
      alpha: this._alpha,
      beta: this._beta,
      gamma: this._gamma
    };
  }

  // Human-readable cardinal direction from heading degrees.
  static cardinal(deg) {
    if (deg === '' || deg === null || deg === undefined) return '—';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }
}
