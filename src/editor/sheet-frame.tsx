import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { SHEET_RADIUS, SheetParts } from '@/ui/sheet';
import { Text } from '@/ui/text';

/** The grabber on top of a sheet, which says it can be dragged down. */
const GRABBER = { width: 36, height: 5 } as const;

/**
 * The content of a sheet (see `Sheet`): a grabber and a title bar with a close button on the
 * left, which drag the sheet down, and `children` under them, clear of the home indicator. A list
 * among them that is a `SheetScrollView` drags the sheet down too, once scrolled to its top.
 */
export function SheetFrame({
  title,
  closeLabel,
  onClose,
  children,
}: {
  readonly title: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.systemBackground,
        // Rounded as its sheet, which doesn't clip what it holds: on Android a clip with round
        // corners costs every frame of a drag.
        borderTopLeftRadius: SHEET_RADIUS,
        borderTopRightRadius: SHEET_RADIUS,
        borderCurve: 'continuous',
        paddingBottom: insets.bottom,
      }}
    >
      <SheetParts
        header={
          <View>
            <View style={{ alignItems: 'center', paddingTop: 6 }}>
              <View
                style={{
                  width: GRABBER.width,
                  height: GRABBER.height,
                  borderRadius: GRABBER.height / 2,
                  backgroundColor: colors.separator,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 50,
                paddingHorizontal: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => ({
                  minWidth: 88,
                  minHeight: 44,
                  paddingHorizontal: 8,
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ color: colors.tint, fontSize: 17 }}>{closeLabel}</Text>
              </Pressable>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  color: colors.label,
                  fontSize: 17,
                  fontWeight: '600',
                }}
              >
                {title}
              </Text>
              {/* Keeps the title centered. */}
              <View style={{ minWidth: 88 }} />
            </View>
          </View>
        }
      >
        {children}
      </SheetParts>
    </View>
  );
}
