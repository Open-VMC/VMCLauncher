#!/bin/bash
set -e

ICON_ICNS="src-tauri/icons/disk-icon.icns"
DMG_DIR="src-tauri/target/release/bundle/dmg"

if [ ! -f "$ICON_ICNS" ]; then
  echo "Error: $ICON_ICNS not found"
  exit 1
fi

if [ ! -d "$DMG_DIR" ]; then
  echo "No DMG directory found at $DMG_DIR, skipping."
  exit 0
fi

ICON_ABS="$(cd "$(dirname "$ICON_ICNS")" && pwd)/$(basename "$ICON_ICNS")"

for dmg in "$DMG_DIR"/*.dmg; do
  [ -f "$dmg" ] || continue
  echo "Patching volume icon: $dmg"

  RW_DMG="$(mktemp).dmg"
  MOUNT_DIR=$(mktemp -d)

  hdiutil convert "$dmg" -format UDRW -o "$RW_DMG" -quiet -ov
  hdiutil attach "$RW_DMG" -mountpoint "$MOUNT_DIR" -nobrowse -quiet

  cp "$ICON_ICNS" "$MOUNT_DIR/.VolumeIcon.icns"
  SetFile -c icnC "$MOUNT_DIR/.VolumeIcon.icns"
  SetFile -a C "$MOUNT_DIR"

  hdiutil detach "$MOUNT_DIR" -quiet
  rm -rf "$MOUNT_DIR"

  hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -o "$dmg" -quiet -ov
  rm -f "$RW_DMG"

  DMG_ABS="$(cd "$(dirname "$dmg")" && pwd)/$(basename "$dmg")"
  osascript -e "
use framework \"AppKit\"
set iconImage to current application's NSImage's alloc()'s initWithContentsOfFile:\"$ICON_ABS\"
current application's NSWorkspace's sharedWorkspace()'s setIcon:iconImage forFile:\"$DMG_ABS\" options:0
" && echo "Finder icon set: $dmg" || echo "Warning: could not set Finder icon"

  echo "Done: $dmg"
done
