import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

/** Title bar with a close button on the left. */
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
        // A page sheet sits below the status bar on iOS; on Android the modal fills the screen.
        paddingTop: Platform.OS === 'android' ? insets.top : 0,
        paddingBottom: Platform.OS === 'android' ? insets.bottom : 0,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 56,
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
      {children}
    </View>
  );
}
