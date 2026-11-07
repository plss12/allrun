# Roadmap

What is left, in order. Why each thing was decided is in `docs/decisions/`; what is done is in the code and the git history.

## 1. Fluid on a modest phone (done, ADR 014)

Targets on a Samsung M32: gestures at 16 ms a frame or less, scrolling at 20 ms or less, opening any screen or panel in under 300 ms with no frame over 100 ms.

- Measured in release (ADR 014, two rounds): launch, home and photos scroll, the home's and the selection's tabs, Summaries and its scroll, opening the editor, moving a photo, the widget gallery, Designs, Stickers, the size slider, the color and "Aa" panels, undo, the export bar, typing, collages with real photos, memory over several editor sessions.
- Over the targets, each with its cost in ADR 014. Step 6 should fix the size slider (18 ms), opening a photo (110-150 ms) and half of the first opening of Designs (500-690 ms); step 2, the widget gallery's opening and closing. Starting a drag (about 40 ms, one frame) stays: its only fix risks the sharpness of the whole image while editing.
- Low value, only if it shows: a gallery's other pages laid out only on swiping (JavaScript time, not frames), with care for the dots (empty or repeated pages are discarded on measuring).
- Closed on 2026-11-06, after a last pass on the iPhone.
- Found after closing it, and solved: memory grew with every screen opened and closed, from collections too rare in both JavaScript runtimes; a collection on coming back to a screen makes it level off (ADR 014). Native memory still creeps about 2 MB a full editor session: look at it again with the app bigger, before publishing.

## 2. Closing the style between phones

- Done: one sheet of our own for the 6 sheets, the same on both phones (ADR 015): a tall card, closed by dragging it down, tapping outside, its button or Android's back; the widget gallery stays mounted. To judge on both phones.
- Done: the system's text size makes the app's text grow up to 1.3 times (`MAX_FONT_SCALE` in `ui/text.tsx`).
- Done: the selected widget shows only four thin corners, as a camera's viewfinder, instead of the whole frame. The owner tried and turned down the frame, dimming the rest of the design (a black widget didn't stand out) and a halo along its shape.

## 3. Finishing R4: selection and designs

- The rest of AllRun's designs, decided and built one at a time with the owner. Built: Crop, Polaroid. Yes so far: Poster, Day, Dark film, Margins, Photobooth. In doubt: Band, Route, Receipt, Music. Out: Duo.
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

Native work goes first on Android, where development builds are free. Then the iOS part, tried a few times on the iPhone without paying (GitHub Actions macOS plus AltStore or SideStore with a free Apple ID), and the 99 € a year of Apple only to publish or use TestFlight (ADR 001). From here the iPhone no longer tests in Expo Go. Native code is fine as long as both phones get the same (the owner's rule): never something native on one phone only.

- Depth effect and image cutout, sharing a segmentation module.
- **Native photo decoding** (ADR 004), approved: ImageIO on iOS and ImageDecoder on Android, straight into a GPU buffer for Skia (`Skia.Image.MakeImageFromNativeBuffer`). Opening a photo holds a frame of 110-150 ms today, its 2,048 px copy going up to the GPU, and HEIC is re-encoded first. **The stock photos too** (`loadStockPhotos`): about half of the first opening of Designs (500-690 ms) is putting them on the GPU, so it should go down to some 250-350 ms; the rest, drawing eleven thumbnails for the first time, stays. Keep it only if it measures clearly faster on both phones.
- **Reanimated's `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` and `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`**, approved: an animated view's transform or opacity without committing the screen's tree (the editor's lift over a panel, the typing overlay, the spinners; the slider's thumb could go back to a view, 3-4 ms a frame less, ADR 014): the size slider, at 18 ms, should get within 16 ms.
- **Wide color on Android**, the owner's rule: the screen decides, Display P3 if it has it, sRGB if not. The iPhone already draws, moves and exports in P3 (`SCREEN_COLOR_SPACE` in `editor/screen-color.ts`); Skia 2.14 draws every Android canvas with no color space, even on a P3 screen. Needs the window in wide color mode and Skia's Android canvas made in P3 when the screen is (a patch or a change upstream), and then `SCREEN_COLOR_SPACE` asks the screen instead of the system. Testing it needs an Android with a P3 screen (the M32 is likely sRGB). Also: a transparent PNG is exported in sRGB because Skia's P3 profile in a PNG isn't Apple's, which Instagram reads; worth checking then.
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

- Video (ADR 009): a flyover of an activity, and a fast replay of a summary's activities.
- Exporting in high quality: today the image is always the canvas's size, 1080 px wide (Instagram's own, so no app rescales it; `core/export.ts`), about 2 megapixels against the 12 to 48 of a phone's photo. An option to save it larger, to print it or zoom in: twice that or the photo's own size, its widgets sharp (they are vectors) and the photo from its export copy (up to 4,096 px). Mind the memory and the time on a modest phone.
- Subscriptions (RevenueCat), route generator, race calendar, more data sources (COROS, Garmin, Suunto through their partner programs), new widgets.
