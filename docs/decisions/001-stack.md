# 001 - Stack

Date: 2026-10-16

## Context

AllRun is a mobile app to overlay running data (single activities and weekly, monthly, yearly or
custom-range summaries) on the user's own photos and share them on Instagram and other networks.
It starts as an MVP but must scale to paid features (subscriptions, video, route generator, race
calendar). The developer works on Windows with an iPhone and no Mac.

## Decision

- **App:** React Native + Expo (SDK 58) + TypeScript `strict`, with Expo Router. iOS and Android
  ship at the same time from one codebase.
- **Editor:** `@shopify/react-native-skia` for the canvas, with `react-native-gesture-handler` and
  `react-native-reanimated` for gestures. Skia renders on the GPU, draws route traces and charts,
  and exports the canvas both as a composite image and as a transparent PNG sticker.
- **Backend:** Supabase. Edge Functions handle the Strava OAuth token exchange and refresh (the
  client secret can't ship in the app); anonymous auth gives a stable user ID (see
  [003](003-accounts-and-templates.md)).
- **Validation:** Zod for Strava responses, configuration and stored templates.
- **i18n:** `i18next` + `expo-localization`, Spanish and English, km and miles.
- **Error reporting:** Sentry.
- **Quality:** ESLint (`expo lint`), `tsc --noEmit`, Jest 30 with `jest-expo`, GitHub Actions CI.
- **Development workflow:** Expo Go on the iPhone until a native module is needed (depth effect,
  milestone 5); then EAS development builds, which require the paid Apple Developer account.
- **Depth effect:** on-device subject segmentation (iOS 17+ Vision, Android ML Kit) through a
  native module, as the last MVP milestone.

### Jest version

The SDK 58 unit-testing guide states that `jest-expo` requires Jest 30, while the Expo versions
API (used by `expo install` and `expo-doctor`) still lists Jest 29.7. We follow the guide and
exclude `jest` and `@types/jest` from Expo's dependency validation (`expo.install.exclude` in
`package.json`).

## Alternatives discarded

- **Web app first (Next.js):** faster to share, but the use case is mobile (photos and Instagram
  live on the phone), gestures feel worse in a mobile browser, only a native app can open
  Instagram Stories with our sticker placed over the photo, and moving to mobile later would mean
  rewriting the whole UI.
- **Expo universal (iOS + Android + web):** keeping every library web-compatible (media library,
  secure store) slows down the start for little benefit.
- **Cloudflare Workers for OAuth:** simpler for two functions, but auth and a database would have
  to be added separately later; Supabase covers both.
