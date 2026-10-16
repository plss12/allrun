# AllRun

Overlay your Strava activities on your own photos with full design freedom, including weekly,
monthly, yearly or custom-range summaries (for example, the 10 weeks of a half-marathon block).
Share the result to Instagram and other networks, as a full image or as a transparent sticker.

> Status: project skeleton. See [docs/decisions](docs/decisions) for the design decisions.

## Requirements

- Node `^22.13.0 || ^24.3.0 || >=26.0.0`
- [Expo Go](https://expo.dev/go) on your phone for development

## Getting started

```bash
npm install
cp .env.example .env   # fill in when the Strava/Supabase integration lands
npm start              # scan the QR code with Expo Go
```

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run lint` | Lint with ESLint (`expo lint`) |
| `npm run typecheck` | Type-check with `tsc` |
| `npm test` | Run unit tests (Jest + `jest-expo`) |
| `npm run doctor` | Check the project with `expo-doctor` |

CI runs lint, type-check, tests and a JS bundle export for iOS and Android on every push and PR.

## License

[MIT](LICENSE) © Pedro Luis Soto Santos
