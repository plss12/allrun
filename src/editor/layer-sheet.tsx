import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type CatalogItem,
  catalogItemKey,
  type CatalogSection,
  type NewLayer,
} from '@/core/layer-catalog';
import { colors } from '@/theme/colors';

interface LayerSheetProps {
  readonly visible: boolean;
  readonly catalog: readonly CatalogSection[];
  /** Adds a widget; free text goes through `onAddText` instead. */
  readonly onAdd: (item: Exclude<NewLayer, { kind: 'text' }>) => void;
  /** Starts typing a new free text, straight on the canvas, once the sheet has closed. */
  readonly onAddText: () => void;
  readonly onClose: () => void;
}

/** Sheet to add a widget from the catalog of the current activity or period. */
export function LayerSheet({ visible, catalog, onAdd, onAddText, onClose }: LayerSheetProps) {
  const { t } = useTranslation();
  // iOS opens no keyboard while a sheet is on screen: free text starts once it has slid away.
  // Android has no dismiss callback, and no such limit.
  const textPending = useRef(false);
  const addText = () => {
    onClose();
    if (Platform.OS === 'ios') {
      textPending.current = true;
    } else {
      onAddText();
    }
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={() => {
        if (textPending.current) {
          textPending.current = false;
          onAddText();
        }
      }}
    >
      <SheetFrame title={t('editor.addLayer')} closeLabel={t('editor.close')} onClose={onClose}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 24 }}>
          {catalog.map((section) => (
            <View key={section.id} style={{ gap: 8 }}>
              <Text
                accessibilityRole="header"
                style={{ color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' }}
              >
                {t(`widgets.sections.${section.id}`).toLocaleUpperCase()}
              </Text>
              <View
                style={{
                  borderRadius: 12,
                  borderCurve: 'continuous',
                  overflow: 'hidden',
                  backgroundColor: colors.secondarySystemBackground,
                }}
              >
                {section.items.map((item, index) => (
                  <CatalogRow
                    key={catalogItemKey(item)}
                    item={item}
                    separator={index > 0}
                    onPress={() => {
                      if (item.kind === 'text') {
                        addText();
                      } else {
                        onAdd(item);
                      }
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SheetFrame>
    </Modal>
  );
}

function CatalogRow({
  item,
  separator,
  onPress,
}: {
  readonly item: CatalogItem;
  readonly separator: boolean;
  readonly onPress: () => void;
}) {
  const label = useCatalogLabel(item);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 16,
        justifyContent: 'center',
        borderTopWidth: separator ? 0.5 : 0,
        borderTopColor: colors.separator,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: colors.label, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

/** Name of a catalog widget in the app language. */
function useCatalogLabel(item: CatalogItem): string {
  const { t } = useTranslation();
  switch (item.kind) {
    case 'metric':
      return t(`metrics.${item.metric}`);
    case 'summaryMetric':
      return t(`summaryMetrics.${item.metric}`);
    case 'info':
      return t(`widgets.${item.field}`);
    case 'logo':
      return t('widgets.allrunLogo');
    case 'text':
    case 'route':
    case 'summaryRoutes':
    case 'summaryChart':
      return t(`widgets.${item.kind}`);
  }
}

/** Title bar with a close button on the left. */
function SheetFrame({
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
