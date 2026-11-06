import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { floatingSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { Text } from '@/ui/text';

import { DOCK_PADDING } from './editor-layout';

const DONE_BUTTON_HEIGHT = 44;

/** A floating panel of options, with a button to close it under them. */
export function Dock({
  children,
  onDone,
}: {
  readonly children: ReactNode;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ ...floatingSurface(24), padding: DOCK_PADDING, gap: 10 }}>
      {children}
      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => ({
          height: DONE_BUTTON_HEIGHT,
          backgroundColor: colors.tint,
          borderRadius: 14,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}
        >
          {t('editor.done')}
        </Text>
      </Pressable>
    </View>
  );
}
