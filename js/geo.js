// GeolocationManager — wraps the browser Geolocation API.
//
// Responsibility: stream the device location (latitude, longitude, accuracy,
// altitude, speed) and expose the latest fix as a plain snapshot.
// Works in iOS Safari and in the Bluefy browser. An MFi external GNSS receiver
// improves these readings automatically (iOS feeds it to Geolocation system-wide).

export class GeolocationManager {
  constructor() {
    this._watchId = null;
    this._latest = null; // last GeolocationPosition
    this._onUpdate = null;
    this._onError = null;
    this.available = 'geolocation' in navigator;
  }

  start({ onUpdate, onError } = {}) {
    this._onUpdate = onUpdate || null;
    this._onError = onError || null;
    if (!this.available) {
      if (this._onError) this._onError(new Error('Geolocation not supported'));
      return false;
    }
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this._latest = pos;
        if (this._onUpdate) this._onUpdate(pos);
      },
      (err) => {
        if (this._onError) this._onError(err);
      },
      options
    );
    return true;
  }

  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }

  // Plain snapshot of the latest fix; empty strings when a field is unavailable.
  latest() {
    if (!this._latest) {
      return {
        latitude: '',
        longitude: '',
        accuracy: '',
        altitude: '',
        altitudeAccuracy: '',
        speed: ''
      };
    }
    const c = this._latest.coords;
    return {
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy: c.accuracy ?? '',
      altitude: c.altitude ?? '',
      altitudeAccuracy: c.altitudeAccuracy ?? '',
      speed: c.speed ?? ''
    };
  }
}
