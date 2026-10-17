import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type CatalogItem,
  catalogItemKey,
  type CatalogSection,
  type NewLayer,
} from '@/core/layer-catalog';
import { MAX_TEXT_LENGTH } from '@/core/template';
import { cleanText } from '@/core/template-edit';
import { colors } from '@/theme/colors';

/** What the sheet is open for: picking a widget to add, or rewriting a text layer. */
export type LayerSheetRequest =
  | { readonly kind: 'add' }
  | { readonly kind: 'editText'; readonly layerId: string; readonly content: string };

interface LayerSheetProps {
  /** `null` while the sheet is closed. */
  readonly request: LayerSheetRequest | null;
  readonly catalog: readonly CatalogSection[];
  readonly onAdd: (item: NewLayer) => void;
  readonly onEditText: (layerId: string, content: string) => void;
  readonly onClose: () => void;
}

/**
 * Sheet to add a widget from the catalog of the current activity or period, or to type free text:
 * picking "Your own text" turns the sheet into a text field, and so does editing a text layer.
 *
 * The content stays mounted while the sheet slides away, so it keeps the last request until a
 * new one opens it again; each opening then starts afresh (step and draft).
 */
export function LayerSheet({ request, catalog, onAdd, onEditText, onClose }: LayerSheetProps) {
  const [shown, setShown] = useState<{ request: LayerSheetRequest; opening: number } | null>(
    request === null ? null : { request, opening: 0 },
  );
  if (request !== null && request !== shown?.request) {
    setShown({ request, opening: (shown?.opening ?? 0) + 1 });
  }
  return (
    <Modal
      visible={request !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {shown === null ? null : (
        <SheetContent
          key={shown.opening}
          request={shown.request}
          catalog={catalog}
          onAdd={onAdd}
          onEditText={onEditText}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function SheetContent({
  request,
  catalog,
  onAdd,
  onEditText,
  onClose,
}: Omit<LayerSheetProps, 'request'> & { readonly request: LayerSheetRequest }) {
  const { t } = useTranslation();
  const [typing, setTyping] = useState(request.kind === 'editText');
  const [draft, setDraft] = useState(request.kind === 'editText' ? request.content : '');

  if (typing) {
    const text = cleanText(draft);
    const save = () => {
      if (text === null) {
        return;
      }
      if (request.kind === 'editText') {
        onEditText(request.layerId, text);
      } else {
        onAdd({ kind: 'text', content: text });
      }
    };
    return (
      <SheetFrame
        title={t('editor.textTitle')}
        closeLabel={t('editor.cancel')}
        onClose={onClose}
        done={{ label: t('editor.done'), enabled: text !== null, onPress: save }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          multiline
          maxLength={MAX_TEXT_LENGTH}
          placeholder={t('editor.textPlaceholder')}
          placeholderTextColor={colors.secondaryLabel}
          accessibilityLabel={t('editor.textTitle')}
          style={{
            marginHorizontal: 16,
            padding: 14,
            minHeight: 120,
            borderRadius: 12,
            borderCurve: 'continuous',
            backgroundColor: colors.secondarySystemBackground,
            color: colors.label,
            fontSize: 20,
            textAlignVertical: 'top',
          }}
        />
      </SheetFrame>
    );
  }

  return (
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
                      setTyping(true);
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

/** Title bar with a close button on the left and an optional confirm button on the right. */
function SheetFrame({
  title,
  closeLabel,
  onClose,
  done,
  children,
}: {
  readonly title: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly done?: {
    readonly label: string;
    readonly enabled: boolean;
    readonly onPress: () => void;
  };
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
        <HeaderButton label={closeLabel} onPress={onClose} />
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
        {done === undefined ? (
          // Keeps the title centered.
          <View style={{ minWidth: 88 }} />
        ) : (
          <HeaderButton label={done.label} onPress={done.onPress} disabled={!done.enabled} bold />
        )}
      </View>
      {children}
    </View>
  );
}

function HeaderButton({
  label,
  onPress,
  disabled = false,
  bold = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly bold?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 88,
        minHeight: 44,
        paddingHorizontal: 8,
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          color: colors.tint,
          fontSize: 17,
          fontWeight: bold ? '600' : '400',
          textAlign: bold ? 'right' : 'left',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
