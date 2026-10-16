import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

/** Centered spinner for the first load of a screen. */
export function LoadingView() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator accessibilityLabel={t('common.loading')} />
    </View>
  );
}

/**
 * Translated error message with an optional retry button. Technical details never reach the
 * screen (they are in English and mean nothing to users): callers record them with `logError`.
 */
export function ErrorView({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text
        selectable
        accessibilityRole="alert"
        style={{ color: colors.label, fontSize: 17, textAlign: 'center' }}
      >
        {message}
      </Text>
      {onRetry === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ paddingVertical: 10, paddingHorizontal: 16 }}
        >
          <Text style={{ color: colors.tint, fontSize: 17, fontWeight: '600' }}>
            {t('common.retry')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Message for a successful load with nothing to show. */
export function EmptyView({ message }: { readonly message: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.secondaryLabel, fontSize: 17, textAlign: 'center' }}>
        {message}
      </Text>
    </View>
  );
}
