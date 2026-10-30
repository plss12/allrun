# AllRun

Overlay your Strava activities on your own photos with full design freedom, including weekly,
monthly, yearly or custom-range summaries (for example, the 10 weeks of a half-marathon block).
Share the result to Instagram and other networks, as a full image or as a transparent sticker.

> Status: core domain (activity model, sport profiles, metrics, period summaries, route
> privacy) running on synthetic Strava-shaped data. The editor and the real Strava integration
> come next. See [docs/decisions](docs/decisions) for the design decisions.

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

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm start`         | Start the Expo dev server            |
| `npm run lint`      | Lint with ESLint (`expo lint`)       |
| `npm run format`    | Format with Prettier                 |
| `npm run typecheck` | Type-check with `tsc`                |
| `npm test`          | Run unit tests (Jest + `jest-expo`)  |
| `npm run doctor`    | Check the project with `expo-doctor` |

CI runs lint, a formatting check, type-check, tests and a JS bundle export for iOS and Android on
every push and PR.

Use the npm version pinned in `packageManager` (or newer) to change dependencies: older npm
releases write an incomplete `package-lock.json` that breaks `npm ci`.

## License

Source available under the [PolyForm Strict License 1.0.0](LICENSE.md) © Pedro Luis Soto Santos:
you may read and use the code for noncommercial purposes, but not change, build on or
distribute it. The AllRun name and logo are not licensed; all rights reserved.

The sport icons drawn into images are [Material Symbols](https://fonts.google.com/icons) by Google,
under the [Apache License 2.0](https://github.com/google/material-design-icons/blob/master/LICENSE)
(`npm run icons` regenerates them).

The sample photo of the photo widget (`assets/images/sample-picture.jpg`, cropped and resized) is
from [Pexels](https://www.pexels.com/photo/33874841/), under the
[Pexels License](https://www.pexels.com/license/).
