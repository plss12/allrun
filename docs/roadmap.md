# Roadmap

What is left, in order. Why each thing was decided is in `docs/decisions/`; what is done is in the code and the git history.

## 1. Fluid on a modest phone (done, ADR 014)

Targets on a Samsung M32: gestures at 16 ms a frame or less, scrolling at 20 ms or less, opening any screen or panel in under 300 ms with no frame over 100 ms.

- Measured in release (ADR 014, two rounds): launch, home and photos scroll, the home's and the selection's tabs, Summaries and its scroll, opening the editor, moving a photo, the widget gallery, Designs, Stickers, the size slider, the color and "Aa" panels, undo, the export bar, typing, collages with real photos, memory over several editor sessions.
- Over the targets, each with its cost in ADR 014. Step 6 should fix the size slider (18 ms), opening a photo (110-150 ms) and half of the first opening of Designs (500-690 ms); step 2, the widget gallery's opening and closing. Starting a drag (about 40 ms, one frame) stays: its only fix risks the sharpness of the whole image while editing.
- Low value, only if it shows: a gallery's other pages laid out only on swiping (JavaScript time, not frames), with care for the dots (empty or repeated pages are discarded on measuring).
- Closed on 2026-11-06, after a last pass on the iPhone.
- Found after closing it, and solved: memory grew with every screen opened and closed, from collections too rare in both JavaScript runtimes; a collection on coming back to a screen makes it level off (ADR 014). Native memory still creeps about 2 MB a full editor session: look at it again with the app bigger, before publishing.
- Found in a third round (ADR 014, 2026-11-12): the galleries scroll over the 20 ms target. Left for step 7, with the other reviews before publishing.

## 2. Closing the style between phones

- Done: one sheet of our own for the 6 sheets, the same on both phones (ADR 015): a tall card, closed by dragging it down, tapping outside, its button or Android's back; the widget gallery stays mounted. To judge on both phones.
- Done: the system's text size makes the app's text grow up to 1.3 times (`MAX_FONT_SCALE` in `ui/text.tsx`).
- Done: the selected widget shows only four thin corners, as a camera's viewfinder, instead of the whole frame. The owner tried and turned down the frame, dimming the rest of the design (a black widget didn't stand out) and a halo along its shape.

## 3. Finishing R4: selection and designs

- The rest of AllRun's designs, decided and built one at a time with the owner. Built: Crop, Polaroid, Slides (the Dark film, as an old slide viewer; ADR 016), Photobooth, Message as one piece, Margins, Calendar (a tear-off calendar's square sheet), and a dark Polaroid and a dark Calendar: fifteen, in the widget gallery's order, for full rows of three. AllRun's designs are closed for the MVP. Both galleries draw in the story format whatever the canvas, and what is chosen fits the canvas; the 25 stock photos are 432 px on their short side (27 MB decoded once a session, from 43 MB at 540 px). Out: Duo, Poster, Day, Route, Receipt, Music (basic widgets) and Band (a photo in a band with a data line and the logo, which Margins covers better). A design must be more than a basic widget on the photo, which the user can place themselves: a new piece or a creative mix (the owner's rule, after trying the Poster).
- Done: filters of the photo (R4e, ADR 017): Chrome, Golden, Portra, Fade, Mono, Motion Blur and Zoom Blur, only on the canvas's own photo, alone, swiped with one finger as on Instagram; the photo moves with two fingers. Judged by the owner on both phones and measured on the M32 (ADR 014, third round): a blurred photo is drawn once, and moves at 12 ms a frame.
- Done: the ADR for R4 (ADR 018): choosing what to make, Stickers, collages, designs and filters, with what was left out.

## 4. Accounts (done, ADR 019)

- Done: an account required from the first launch, with an email and a password (confirmed by a link), or Google in the browser; Apple's button says it is coming until step 7. The profile, from the AllRun logo: hiding the ends of routes (off, or 100, 200 or 500 m, applied where activities come in), update emails only with their own opt-in (GDPR), signing out and deleting the account inside the app. The user's designs sync with the account, local first, the later write winning; photos stay out. What publishing needs (own SMTP and domain, Google in production, Sign in with Apple) is in step 7.

## 5. Milestone 4: Strava for real

How Strava is connected and cached: ADR 020.

- Done (2026-11-13): connecting Strava, its refresh token kept by the server; the activities read from Strava with a cache on the phone; streams, splits, laps and heart rate zones on demand; tested with the owner's real activities on both phones, which brought out the overlaid routes of a period done in several places (now grouped by place). Also the app's language in the profile.
- Done: a real walk's raw JSON (recorded with the Strava app on the phone) has no steps, nor does the API reference mention them anywhere: no steps (the owner's decision: Strava's data only).
- The map under routes (ADR 021, accepted): OpenFreeMap's vector tiles drawn with Skia, muted, no labels, the credit only in the profile. In order: tile math and style in `src/core/` with tests; tiles fetched and cached on the phone (`@mapbox/vector-tile`, `pbf`); the home's activity cards (measured on the M32: scroll at 20 ms or less); "Credits and licences" in the profile; then a "with map" variant of the route with a big datum in the editor.
- Done: place names by province in Spain ("Andújar, Jaén"; a capital names its community, "Jaén, Andalucía"), the same on both phones, from the phone's geocoder and a table of the provinces; every permission asked for as the app opens.
- Request Strava's API review once it works with the owner's account (10 athletes until then). Creating the API app needs a paid Strava subscription, which the owner accepts.

## 6. Milestone 5: native

Native work goes first on Android, where development builds are free. Then the iOS part, tried a few times on the iPhone without paying (GitHub Actions macOS plus AltStore or SideStore with a free Apple ID), and the 99 € a year of Apple only to publish or use TestFlight (ADR 001). From here the iPhone no longer tests in Expo Go. Native code is fine as long as both phones get the same (the owner's rule): never something native on one phone only.

- Depth effect and image cutout, sharing a segmentation module.
- **Native photo decoding** (ADR 004), approved: ImageIO on iOS and ImageDecoder on Android, straight into a GPU buffer for Skia (`Skia.Image.MakeImageFromNativeBuffer`). Opening a photo holds a frame of 110-150 ms today, its 2,048 px copy going up to the GPU, and HEIC is re-encoded first. **The stock photos too** (`loadStockPhotos`): about half of the first opening of Designs (about 1.1 s once they are decoded, ADR 014 third round) is putting them on the GPU and making their mipmaps, so it should go down to some 500 ms; the rest, drawing eleven thumbnails for the first time, stays. Keep it only if it measures clearly faster on both phones.
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
- **Accounts (ADR 019)**: a domain and a mail provider (Resend or another) as Supabase's SMTP, or the confirmation and reset emails reach only the project's team; Google's consent screen moved to production (and Supabase's custom domain on it, if taken); Sign in with Apple set up and tested with the paid Apple account.
- **Reviews on a modest phone before publishing** (the owner's decision, 2026-11-12), measured on the M32 in release as in ADR 014:
  - **The galleries' scroll**: 32-38 ms a frame in "+", 20-28 in Designs and 19-34 in Stickers, against 20 (the home screen, 19, is about React Native's floor on that phone). Not the tiles: the same with no canvas at all; the main thread spreads it over the scroll view (21 %), mounting the list's next rows while it moves (16 %), Reanimated handling each scroll event (13 %) and recording the frame (22 %). First a session of two or three hours, low risk: find what Reanimated does with the vertical scroll's events and take it out if it isn't needed, and mount the rows ahead while the gallery is still instead of while it scrolls; expected 25-28 ms. Only if that isn't enough, FlashList (one or two sessions, a real risk: a reused tile draws its canvas again, about 12 ms, and tiles came back piece by piece once before). Hiding what is under a sheet saves about 5 ms more, but the strip over the card would show black instead of the dimmed editor: only with the owner's OK.
  - **Native memory**, which still creeps about 2 MB a full editor session (step 1).

## After the MVP

- Video (ADR 009): a flyover of an activity, and a fast replay of a summary's activities.
- Exporting in high quality: today the image is always the canvas's size, 1080 px wide (Instagram's own, so no app rescales it; `core/export.ts`), about 2 megapixels against the 12 to 48 of a phone's photo. An option to save it larger, to print it or zoom in: twice that or the photo's own size, its widgets sharp (they are vectors) and the photo from its export copy (up to 4,096 px). Mind the memory and the time on a modest phone.
- Subscriptions (RevenueCat), route generator, race calendar, more data sources (COROS, Garmin, Suunto through their partner programs), new widgets.
