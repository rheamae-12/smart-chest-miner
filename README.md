# Smart MinerGuard

Real-time miner vital monitoring and session analytics console built with React, Vite, and Firebase.

## Development

```bash
npm install
npm run dev
```

Create `.env` from `.env.example` and provide the Firebase configuration values before using realtime data.

## Checks

```bash
npm test
npm run lint
npm run build
```

The production build is generated in `dist/` and is configured for Firebase Hosting.

## Hardware

The ESP32 firmware is in [`firmware/smart_chest_miner_full`](firmware/smart_chest_miner_full). Hardware setup and Firebase data conventions are documented in [`docs/HARDWARE_NOTES.md`](docs/HARDWARE_NOTES.md).
