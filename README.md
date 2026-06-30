# BLE Range Logger — Web App

A no-install Progressive Web App that logs **BLE connection state**, **best-effort
RSSI**, and **GPS coordinates + accuracy**, then exports a **CSV**. It runs on your
iPhone today as a stopgap while the native app is built. The CSV format matches
the native app, so logs are interchangeable.

---

## What it can and cannot do on iPhone

| Capability | iOS Safari | iOS + Bluefy browser | Native app (later) |
| --- | --- | --- | --- |
| GPS lat/long + accuracy | Yes | Yes | Yes |
| BLE connect / disconnect | No (Safari lacks Web Bluetooth) | Yes | Yes |
| BLE RSSI | No | Best-effort, often unavailable | Reliable |
| Background logging (screen off) | No | No | Yes |
| CSV export | Yes | Yes | Yes |

**Two important limitations of any web app on iPhone:**

1. **No background logging.** When the screen locks or you switch apps, iOS freezes
   the page and logging pauses. **Keep the screen on and the app in the
   foreground during a run.** The app requests a Wake Lock to help keep the screen
   awake, but you should also set Auto-Lock to a long value (see Tips).
2. **RSSI is unreliable.** The Web Bluetooth standard has no API to read RSSI for a
   connected device. The app tries advertisement RSSI, which often returns nothing
   on iOS. For dependable RSSI-vs-distance range testing, use the native app.

> **Good news on accuracy:** an MFi external GNSS receiver improves the web app's
> GPS too, because iOS feeds it into Geolocation system-wide — no app changes needed.

---

## 1. Host it on GitHub Pages (HTTPS is required)

Bluetooth and Geolocation only work over HTTPS, so the page must be served, not
opened as a file. GitHub Pages gives you a permanent HTTPS link for free.

1. Create a free account at [github.com](https://github.com).
2. Create a new **public** repository (e.g. `ble-range-logger`).
   - GitHub Pages on free accounts requires a public repo. If you want it private,
     use Netlify or Vercel drag-and-drop instead (see "Alternative hosting").
3. Upload the contents of this `webapp/` folder to the repository. Easiest path:
   - On the repo page, click **Add file -> Upload files**, drag in everything
     inside `webapp/` (keep the `js/` subfolder), then **Commit changes**.
4. Go to **Settings -> Pages**.
5. Under **Build and deployment -> Source**, choose **Deploy from a branch**.
6. Set **Branch** to `main` and folder to **`/ (root)`**, then **Save**.
7. Wait about a minute, then refresh. GitHub shows your live URL, for example:
   `https://YOUR-USERNAME.github.io/ble-range-logger/`

If you uploaded the whole `webapp/` folder instead of its contents, the URL will be
`https://YOUR-USERNAME.github.io/ble-range-logger/webapp/`. Both work — the app uses
relative paths.

### Alternative hosting (no GitHub, keeps it private)

- [Netlify Drop](https://app.netlify.com/drop) or
  [Vercel](https://vercel.com): drag the `webapp/` folder onto the page and you get
  an instant HTTPS link. No git, repo stays private.

---

## 2. Open it on your iPhone

### For GPS-only logging (simplest)

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Start**. Allow location access when prompted.
3. The BLE button is disabled in Safari — that is expected.

### For GPS **and** BLE logging (recommended for range testing)

Safari cannot do Bluetooth, so use **Bluefy**, a free browser that adds Web
Bluetooth to iOS:

1. Install **Bluefy - Web BLE Browser** from the App Store.
2. Open Bluefy and navigate to your GitHub Pages URL.
3. Tap **Select BLE Device**, pick your device, and it connects.

### Which BLE devices work (and which don't)

This app speaks **Bluetooth Low Energy (BLE / GATT)** only. That is what Web
Bluetooth exposes.

**Will NOT work:**

- **Headphones, earbuds, speakers, car kits.** These use *Classic Bluetooth
  audio* (A2DP/HFP), a different protocol. iOS shows them as "connected" with a
  volume HUD, but Web Bluetooth cannot see or track that link. The app will show
  `connecting` then drop to `disconnected`, and display a note explaining this.

**Will work (use one of these for range testing):**

- A **BLE sensor / beacon / tag** (e.g. iBeacon/Eddystone tag, Tile-style
  tracker, BLE temperature or heart-rate sensor).
- A **dev board** advertising as a BLE peripheral: **ESP32**, **nRF52**
  (Nordic), Arduino with BLE, Raspberry Pi Pico W.
- **A second phone** running a free "BLE peripheral / advertiser" app:
  - Android: **nRF Connect** (Nordic) -> Advertiser, or **BLE Peripheral Simulator**.
  - The peripheral must expose a connectable **GATT server** so this app can open
    a connection and track connect/disconnect.

> Tip: if you only need to confirm the app works, an ESP32 flashed with a basic
> BLE "server" example is the cheapest reliable test target.

### Add to Home Screen (optional, makes it feel like an app)

- In Safari: **Share -> Add to Home Screen**. Launches full-screen.
  (Bluetooth still needs Bluefy; the home-screen icon is best for GPS-only use.)

---

## 3. Run a measurement

1. (Bluefy) **Select BLE Device** and confirm it shows `connected`.
2. Optionally set the **Snapshot interval** (default 1 second).
3. Leave **GPS source** on `internal`, or flip it to `external` when an MFi
   receiver is paired (this only tags the CSV; iOS picks the receiver
   automatically).
4. Tap **Start**. Keep the screen on and the app open.
5. Walk the range. Connect/disconnect events are logged instantly; snapshot rows
   are logged on the interval.
6. Tap **Stop**, then **Export CSV**. On iPhone the share sheet lets you **Save to
   Files**, **AirDrop** to your Mac, or email it.

---

## 4. CSV format

```
timestamp_iso, event_type, ble_state, rssi_dbm, latitude, longitude,
horizontal_accuracy_m, altitude_m, vertical_accuracy_m, speed_mps, gps_source,
compass_heading_deg, compass_accuracy_deg, orientation_alpha_deg,
orientation_beta_deg, orientation_gamma_deg
```

- `event_type`: `session_start`, `snapshot`, `ble_event`, `session_end`
- `ble_state`: `connected`, `connecting`, `disconnected`
- `compass_heading_deg`: absolute magnetic heading (0 = N, 90 = E), iOS only.
- `orientation_beta_deg`: pitch (front/back tilt). `orientation_gamma_deg`: roll
  (left/right tilt). `orientation_alpha_deg`: yaw (relative to app start on iOS).
- Empty cells mean the value was unavailable (e.g. RSSI on iOS, GPS before the
  first fix, or orientation before Motion permission is granted).
- Timestamps are ISO-8601 UTC with milliseconds.

---

## 5. External GNSS receivers

Start with the iPhone's internal GPS. To improve accuracy later, an **MFi-certified**
Bluetooth receiver feeds iOS system-wide, so this web app benefits automatically:

- **Tier 1 (~1.5-3 m, plug-and-play):** Bad Elf GPS Pro+, Dual XGPS160, Garmin GLO 2.
- **Tier 2 (sub-meter to cm, RTK):** Bad Elf Flex, Emlid Reach RX, EOS Arrow
  (need an NTRIP correction service).

When a receiver is paired, flip the **GPS source** toggle to `external` so the CSV
records which source was used, and watch `horizontal_accuracy_m` drop.

---

## 6. Tips and troubleshooting

- **Screen keeps sleeping:** Settings -> Display & Brightness -> Auto-Lock -> set to
  a long value or Never during a run. The in-app Wake Lock helps but Auto-Lock can
  override it.
- **"Select BLE Device" is greyed out:** you are in Safari. Use Bluefy for BLE.
- **State stays `connecting`, or connects then immediately disconnects:** the
  device is almost certainly Classic-Bluetooth audio (headphones/speaker). Those
  cannot be tracked — use a real BLE peripheral (see "Which BLE devices work").
- **No location values:** grant location permission; go outdoors for a first fix.
- **RSSI stays blank:** expected on iOS — the web platform does not expose it
  reliably. Use the native app for RSSI.
- **Nothing logs after you lock the phone:** expected for web apps — keep the screen
  on. Background logging is a native-app feature.

---

## Files

| File | Purpose |
| --- | --- |
| `index.html` | UI layout |
| `styles.css` | Styling (mobile-first dark theme) |
| `js/app.js` | Orchestration, session control, Wake Lock, service-worker registration |
| `js/geo.js` | Geolocation wrapper |
| `js/ble.js` | Web Bluetooth wrapper |
| `js/compass.js` | Compass heading + device orientation (gyro angles) |
| `js/logger.js` | CSV row building and export |
| `manifest.webmanifest` | PWA metadata |
| `service-worker.js` | Offline app-shell cache |
| `icon.svg` | App icon |
