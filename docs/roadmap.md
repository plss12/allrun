# Roadmap

What is left, in order. Why each thing was decided is in `docs/decisions/`; what is done is in the code and the git history.

## 1. Fluid on a modest phone (in progress, ADR 014)

Targets on a Samsung M32: gestures at 16 ms a frame or less, scrolling at 20 ms or less, opening any screen or panel in under 300 ms with no frame over 100 ms.

- Measured in release (ADR 014): launch, home and photos scroll, opening the editor, moving a photo, the widget gallery (now kept mounted: instant from its second opening).
- Starting a drag (about 40 ms on the UI thread) and frames during a gesture waiting on the GPU: the scene is drawn on each touch and again on the frame's callbacks.
- Opening the Summaries tab (a 500 ms frame: every canvas of its cards is made at once) and its scroll (23-25 ms).
- Still to measure in release: panels, typing, undo, export, sheets, collages, Stickers, Designs, the size slider, memory over a long session.
- A gallery's other pages laid out only on swiping, with care for the dots (empty or repeated pages are discarded on measuring).
- With a build: native photo decoding (ADR 004), and Reanimated's `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` and `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`.
- A last pass on the iPhone.

## 2. Closing the style between phones

- The 6 sheets are a card on iOS and full screen on Android: decide on seeing them; an own sheet with its closing gesture is the costly fix.
- A cap for the system's largest text (`maxFontSizeMultiplier`).
- The widgets' selection frame: the owner dislikes it, with no better idea yet.

## 3. Finishing R4: selection and designs

- The rest of AllRun's designs, decided and built one at a time with the owner. Yes so far: Crop, Polaroid, Poster, Day, Dark film, Margins, Photobooth. In doubt: Band, Route, Receipt, Music. Out: Duo.
- Designs with dates: an AllRun design can carry a start and an end date, inside the app, and shows or hides by itself (seasonal ones, such as Christmas).
- Filters (R4e): Zoom Blur, Motion Blur, Portra, Mono, Ink, with Skia (color matrices, runtime shaders) so the export matches; one filter for the whole design, collages too. A one-finger sideways swipe always changes the filter, as on Instagram, and photos move with two fingers. This overturns "dragging an empty area frames the photo" (ADR 009, ADR 011) and the one-finger move in collage cells: update them then.
- An ADR for R4.

## 4. Accounts

- Login required before publishing, replacing the anonymous user of ADR 003 (needs its own ADR). Strava's sign-in gives no email, so own accounts with Supabase: Apple, Google and email. Sign in with Apple if Google is offered, account deletion inside the app, and Apple's rule on requiring login to check when publishing.
- Update emails only with their own opt-in consent (GDPR): having an account doesn't grant it.
- The user's own designs sync: a Supabase table of rows (user, template JSON, updated at) with row level security; local first, the last write wins. Photos stay out, as they already do (`saveDesign`, `withEmptySlots`): slots come empty on another phone.
- A profile with its settings: hiding the start and end of routes, off by default. Nothing can turn it on until then, so it must exist before publishing.

## 5. Milestone 4: Strava for real

- Sign-in and token exchange (`expo-web-browser` comes back). A quick look at real activities is worth it early: they may bring out what sample data hides.
- Streams, splits and laps on demand; heart rate zones need the `profile:read_all` permission.
- A real walk's raw JSON: use steps only if Strava sends them, undocumented (the owner's decision: Strava's data only).
- The map behind routes (ADR 009): Mapbox or MapTiler, with the key behind Supabase. Check cost, and the attribution their licences require, also on exported images.
- Place names from the map provider, by country: in Spain the province, not the region ("Andújar, Jaén"); elsewhere the region (the province field is the county in the US). Today `place-lookup.ts` keeps only the region.
- Request Strava's API review once it works with the owner's account (10 athletes until then). Creating the API app needs a paid Strava subscription, which the owner accepts.

## 6. Milestone 5: native

Native work goes first on Android, where development builds are free. Then the iOS part, tried a few times on the iPhone without paying (GitHub Actions macOS plus AltStore or SideStore with a free Apple ID), and the 99 € a year of Apple only to publish or use TestFlight (ADR 001).

- Depth effect and image cutout, sharing a segmentation module.
- Sentry, and the Story button (to an Instagram story directly).

## 7. Publishing

- Accounts: Apple and Google Play.
- **Photo permission on Google Play**, the biggest risk: `READ_MEDIA_IMAGES` is only for apps whose core functionality needs broad access, with a declaration of why the Photo Picker isn't enough, and a custom picker doesn't qualify by itself. The fallback is the system picker on Android, which would make that screen differ from the iPhone's (ADR 013).
- **EAS Update (`expo-updates`) in the first build that goes to the stores**: new designs, widgets without native code and fixes reach phones without a store release. A first version without it can never receive them. Check Apple's rule and Expo's plan limits when adding it.
- EAS builds of Android die for lack of memory (Gradle's process vanishes while compiling C++): before the final builds, try the `large` builder (check its cost first) or limit the C++ compilers as `scripts/build-android-wsl.sh` does with ninja.
- EAS environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `_PUBLISHABLE_KEY`): without them the app silently stays on its built-in phrases.
- Supabase's free plan pauses a project after a week of low activity: review the plan.
- Native permission texts in both languages, the stores' listings and a privacy policy.

## After the MVP

Summary video, subscriptions (RevenueCat), route generator, race calendar, more data sources (COROS, Garmin, Suunto through their partner programs), new widgets.
