#!/usr/bin/env bash
# Builds the Android development client in Ubuntu (WSL), from a copy of the working tree in ~/allrun:
# on Windows, the paths of the C++ objects pass its limit of 260 characters. Needs in the home:
# ~/.local/node, ~/.local/jdk-17 and ~/Android/Sdk, with the licences' files. Native changes only:
# the JavaScript comes from Metro on Windows (npm run start:build).
#
#   wsl -d Ubuntu --cd '~' -- bash /mnt/c/Users/pepol/Desktop/AllRun/scripts/build-android-wsl.sh
#
# Then, from Windows: adb install -r \\wsl.localhost\Ubuntu\home\<user>\allrun\android\app\build\outputs\apk\debug\app-debug.apk
set -euo pipefail

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$HOME/allrun"
export JAVA_HOME="$HOME/.local/jdk-17"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$HOME/.local/node/bin:$JAVA_HOME/bin:/usr/local/bin:/usr/bin:/bin"
export CI=1
# Compiling every module at once runs out of memory: 16 GB weren't enough.
export GRADLE_OPTS='-Dorg.gradle.jvmargs="-XX:MaxMetaspaceSize=1g -Xmx4g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8" -Dorg.gradle.parallel=false -Dorg.gradle.workers.max=2'

mkdir -p "$PROJECT"
tar -C "$SOURCE" --exclude=./node_modules --exclude=./android --exclude=./ios --exclude=./dist \
  --exclude=./.expo --exclude=./.git --exclude=./docs --exclude=./.env -cf - . | tar -C "$PROJECT" -xf -
cd "$PROJECT"
npx --yes npm@11.19.1 ci --no-audit --no-fund
npx expo prebuild --platform android --no-install
cd android
./gradlew app:assembleDebug -x lint -x test --build-cache -PreactNativeArchitectures=arm64-v8a
