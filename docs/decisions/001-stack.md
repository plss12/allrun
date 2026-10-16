# 001 - Stack

Date: 2026-10-16

## Context

AllRun is a mobile app to overlay running data (single activities and weekly, monthly, yearly or
custom-range summaries) on the user's own photos and share them on Instagram and other networks.
It starts as an MVP but must scale to paid features (subscriptions, video, route generator, race
calendar). The developer works on Windows with an iPhone and no Mac.

## Decision

- **App:** React Native + Expo (SDK 57, see below) + TypeScript `strict`, with Expo Router. iOS
  and Android ship at the same time from one codebase.
- **Editor:** `@shopify/react-native-skia` for the canvas, with `react-native-gesture-handler` and
  `react-native-reanimated` for gestures. Skia renders on the GPU, draws route traces and charts,
  and exports the canvas both as a composite image and as a transparent PNG sticker.
- **Backend:** Supabase. Edge Functions handle the Strava OAuth token exchange and refresh (the
  client secret can't ship in the app); anonymous auth gives a stable user ID (see
  [003](003-accounts-and-templates.md)).
- **Validation:** Zod for Strava responses, configuration and stored templates.
- **i18n:** `i18next` + `expo-localization`, Spanish and English, km and miles.
- **Error reporting:** Sentry.
- **Quality:** ESLint (`expo lint`), `tsc --noEmit`, Jest with `jest-expo`, GitHub Actions CI.
- **Development workflow:** Expo Go on the iPhone until a native module is needed (depth effect,
  milestone 5). To avoid paying the Apple Developer Program (99 €/year) before deciding to publish,
  native work goes **Android first**: development builds install for free on the Android emulator
  or a device, so every native feature is built and tested there. The iOS side is then written and
  tried on the iPhone for free a few times: the public repo gets free macOS runners on GitHub
  Actions to build an unsigned app, sideloaded with AltStore/SideStore and a free Apple ID (apps
  expire after 7 days, at most 3 at once). The paid account is only needed for TestFlight and the
  App Store. Discarded: a macOS virtual machine (Apple's license only allows macOS on Apple
  hardware) and rented cloud Macs (they cost money and cannot install on the phone with a free
  account).
- **Depth effect:** on-device subject segmentation (iOS 17+ Vision, Android ML Kit) through a
  native module, as the last MVP milestone.

### Expo SDK version

The project started on SDK 58 (released 2026-10-15), but the App Store Expo Go only supports up
to SDK 57, and Expo said the SDK 58 build would follow "within a few weeks". Since development
relies on Expo Go on an iPhone, we moved to SDK 57 on 2026-10-16. Upgrade to SDK 58 once the App
Store Expo Go supports it (`expo-upgrade` skill). Notes for that upgrade:

- SDK 58's `jest-expo` requires Jest 30, while Expo's versions API still lists Jest 29.7; follow
  the unit-testing guide and exclude `jest` and `@types/jest` from `expo.install.exclude`.
- `react-native-gesture-handler` jumps from 2.x to 3.x.

Alternatives discarded: a development build or `eas go` (both require the paid Apple Developer
account before it is otherwise needed), or pausing device testing for weeks.

### npm version and formatting

npm versions disagree on `package-lock.json`: npm 11.6 omits optional peer dependencies
(`@emnapi/core`, `@emnapi/runtime` of `@napi-rs/wasm-runtime`) that npm 10.9, 11.4 and 11.19
require, so `npm ci` fails. A lockfile written by npm 11.19.1 is accepted by all of them. We pin
`"packageManager": "npm@11.19.1"` and CI installs that version before `npm ci`; developers use it
(or newer) to change dependencies. Raising the minimum Node to 24 would not help: Node 24.3 ships
npm 11.4, which also rejects the incomplete lockfile.

Prettier (print width 100, single quotes) formats the code, enforced through ESLint
(`eslint-plugin-prettier`, as recommended by Expo) and checked in CI.

## Alternatives discarded

- **Web app first (Next.js):** faster to share, but the use case is mobile (photos and Instagram
  live on the phone), gestures feel worse in a mobile browser, only a native app can open
  Instagram Stories with our sticker placed over the photo, and moving to mobile later would mean
  rewriting the whole UI.
- **Expo universal (iOS + Android + web):** keeping every library web-compatible (media library,
  secure store) slows down the start for little benefit.
- **Cloudflare Workers for OAuth:** simpler for two functions, but auth and a database would have
  to be added separately later; Supabase covers both.
