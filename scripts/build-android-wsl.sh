#!/usr/bin/env bash
# Builds the Android app in Ubuntu (WSL), from a copy of the working tree in ~/allrun: on Windows,
# the paths of the C++ objects pass its limit of 260 characters. Needs in the home: ~/.local/node,
# ~/.local/jdk-17 and ~/Android/Sdk, with the licences' files.
#
#   wsl -d Ubuntu --cd '~' -- bash /mnt/c/Users/pepol/Desktop/AllRun/scripts/build-android-wsl.sh [release]
#
# With no argument, the development client, only on changing native code: its JavaScript comes from
# Metro on Windows (npm run start:build). With `release`, the app with its JavaScript inside, as in
# production, to measure speed and memory; the same package and signing key, so it installs over
# the development client. Then, from Windows:
#   adb install -r \\wsl.localhost\Ubuntu\home\<user>\allrun\android\app\build\outputs\apk\<debug|release>\app-<debug|release>.apk
set -euo pipefail

case "${1:-debug}" in
  debug) TASK=app:assembleDebug ;;
  release) TASK=app:assembleRelease ;;
  *)
    echo "Unknown build type '$1': use 'release' or nothing." >&2
    exit 1
    ;;
esac

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$HOME/allrun"
export JAVA_HOME="$HOME/.local/jdk-17"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$HOME/.local/node/bin:$JAVA_HOME/bin:/usr/local/bin:/usr/bin:/bin"
export CI=1
# Compiling every module at once runs out of memory: 16 GB weren't enough.
export GRADLE_OPTS='-Dorg.gradle.jvmargs="-XX:MaxMetaspaceSize=1g -Xmx4g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8" -Dorg.gradle.parallel=false -Dorg.gradle.workers.max=2'

# The SDK's ninja runs a C++ compiler per thread (20 on this PC), and Skia's ran Ubuntu out of its
# 12 GB: Gradle can't limit them, so its ninja is wrapped with a fixed number of jobs.
for ninja in "$ANDROID_HOME"/cmake/*/bin/ninja; do
  [ -e "$ninja.real" ] || mv "$ninja" "$ninja.real"
  printf '#!/bin/sh\nexec "$0.real" -j 6 "$@"\n' > "$ninja"
  chmod +x "$ninja"
done

mkdir -p "$PROJECT"
tar -C "$SOURCE" --exclude=./node_modules --exclude=./android --exclude=./ios --exclude=./dist \
  --exclude=./.expo --exclude=./.git --exclude=./docs --exclude=./.env -cf - . | tar -C "$PROJECT" -xf -
cd "$PROJECT"
# Installing and generating the native project take minutes, and most builds only change the
# JavaScript: each is done again only when what it depends on has changed.
lock_sum="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ "$(cat node_modules/.allrun-lock 2>/dev/null)" != "$lock_sum" ]; then
  npx --yes npm@11.19.1 ci --no-audit --no-fund
  echo "$lock_sum" > node_modules/.allrun-lock
fi
native_sum="$(find app.json package-lock.json assets/images -maxdepth 1 -type f | sort | xargs cat |
  sha256sum | cut -d' ' -f1)"
if [ "$(cat android/.allrun-native 2>/dev/null)" != "$native_sum" ]; then
  npx expo prebuild --platform android --no-install
  echo "$native_sum" > android/.allrun-native
fi
# A local release build is for measuring: profileable, so that simpleperf can sample it on the
# phone. The stores' builds come from EAS, without it.
manifest=android/app/src/main/AndroidManifest.xml
if [ "$TASK" = app:assembleRelease ] && ! grep -q '<profileable' "$manifest"; then
  sed -i 's#</application>#  <profileable android:shell="true"/>\n  </application>#' "$manifest"
fi
cd android
./gradlew "$TASK" -x lint -x test --build-cache -PreactNativeArchitectures=arm64-v8a
