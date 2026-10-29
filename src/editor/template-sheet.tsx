import type { SkImage } from '@shopify/react-native-skia';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { EditorLayers } from '@/core/editor-document';
import { STARTER_TEMPLATE_IDS, starterTemplate } from '@/core/starter-templates';
import { CANVAS_FORMATS, type CanvasFormat, type Template } from '@/core/template';
import { isSaved, saveDesign, type SavedTemplate, templatesFor } from '@/core/user-templates';
import { newTemplateId } from '@/data/template-store';
import type { UserTemplates } from '@/data/user-templates';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';

import type { EditorData } from './editor-data';
import { SheetFrame } from './sheet-frame';
import type { LayerContext } from './template-scene';
import { TemplateThumbnail } from './template-thumbnail';

interface TemplateSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly data: EditorData;
  readonly format: CanvasFormat;
  /** The design on the canvas, which "Save current design" keeps. */
  readonly design: Template;
  readonly layerContext: LayerContext;
  readonly photo: SkImage | null;
  /** The photo's dominant color, for the `auto` background; `null` without a photo. */
  readonly dominant: string | null;
  readonly userTemplates: UserTemplates;
  /**
   * What choosing a template does: one of the user's designs brings its widgets, where its photo
   * goes and its background; one of AllRun's, its widgets only (`null` for the default, Sport).
   */
  readonly onChoose: (
    choice:
      | { readonly kind: 'design'; readonly template: Template }
      | { readonly kind: 'layers'; readonly layers: EditorLayers },
  ) => void;
}

/** Room around and between the thumbnails, in points. */
const PADDING = 16;
const GAP = 12;

/**
 * Sheet to pick a template, each one drawn live with the user's data and photo (ADR 007): on
 * top the user's own designs of this format, with a button to save the current one; below,
 * AllRun's, drawn with the current photo placement and background, which they keep.
 */
export function TemplateSheet(props: TemplateSheetProps) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <SheetFrame
        title={t('templates.title')}
        closeLabel={t('editor.close')}
        onClose={props.onClose}
      >
        <TemplateGrid {...props} />
      </SheetFrame>
    </Modal>
  );
}

function TemplateGrid({
  data,
  format,
  design,
  layerContext,
  photo,
  dominant,
  userTemplates,
  onChoose,
}: TemplateSheetProps) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  // Three thumbnails per row, two of the wide landscape format.
  const columns = format === 'landscape' ? 2 : 3;
  const width = Math.floor((window.width - 2 * PADDING - (columns - 1) * GAP) / columns);
  const height = (width * CANVAS_FORMATS[format].height) / CANVAS_FORMATS[format].width;
  const [saving, setSaving] = useState(false);
  const thumbnail = (template: Template) => (
    <TemplateThumbnail
      template={template}
      layerContext={layerContext}
      photo={photo}
      dominant={dominant}
      width={width}
    />
  );

  const saveCurrent = async () => {
    setSaving(true);
    try {
      const now = new Date();
      await userTemplates.save(saveDesign(design, newTemplateId(now), now.toISOString()));
    } catch (error) {
      logError('Could not save the template', error);
      Alert.alert(t('templates.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (saved: SavedTemplate) =>
    Alert.alert(t('templates.deleteTitle'), t('templates.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('templates.delete'),
        style: 'destructive',
        onPress: () => {
          userTemplates.remove(saved.template.id).catch((error: unknown) => {
            logError('Could not delete the template', error);
            Alert.alert(t('templates.deleteError'));
          });
        },
      },
    ]);

  const mine =
    userTemplates.status === 'success' ? templatesFor(userTemplates.data, format, data.mode) : null;
  const alreadySaved = userTemplates.status === 'success' && isSaved(userTemplates.data, design);

  return (
    <ScrollView contentContainerStyle={{ padding: PADDING, paddingTop: 4, gap: 24 }}>
      <Section title={t('templates.yours')}>
        {userTemplates.status === 'loading' ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} style={{ height }} />
        ) : userTemplates.status === 'error' ? (
          <View style={{ gap: 8, alignItems: 'flex-start' }}>
            <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>
              {t('templates.loadError')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={userTemplates.retry}
              hitSlop={8}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: colors.tint, fontSize: 17 }}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <Grid>
            <SaveTile
              width={width}
              height={height}
              saved={alreadySaved}
              busy={saving}
              onPress={saveCurrent}
            />
            {mine?.map((saved, i) => (
              <View key={saved.template.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('templates.saved', { number: i + 1 })}
                  onPress={() => onChoose({ kind: 'design', template: saved.template })}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Frame>{thumbnail(saved.template)}</Frame>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('templates.delete')}
                  hitSlop={10}
                  onPress={() => confirmRemove(saved)}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close' }}
                    size={13}
                    weight="bold"
                    tintColor="#FFFFFF"
                  />
                </Pressable>
              </View>
            ))}
          </Grid>
        )}
      </Section>
      <Section title={t('templates.allrun')}>
        <Grid>
          {STARTER_TEMPLATE_IDS.map((id) => {
            // Only their widgets change: they show over the photo and background as they are.
            const starter = {
              ...starterTemplate(id, data, format),
              photo: design.photo,
              background: design.background,
            };
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={t(`templates.starters.${id}`)}
                onPress={() =>
                  // Sport is the default design: choosing it goes back to its widgets.
                  onChoose({ kind: 'layers', layers: id === 'sport' ? null : starter.layers })
                }
                style={({ pressed }) => ({ width, gap: 6, opacity: pressed ? 0.7 : 1 })}
              >
                <Frame>{thumbnail(starter)}</Frame>
                <Text
                  numberOfLines={1}
                  importantForAccessibility="no"
                  maxFontSizeMultiplier={1.3}
                  style={{
                    color: colors.label,
                    fontSize: 13,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  {t(`templates.starters.${id}`)}
                </Text>
              </Pressable>
            );
          })}
        </Grid>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' }}
      >
        {title.toLocaleUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Grid({ children }: { readonly children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>{children}</View>;
}

/** Rounded corners around a thumbnail, like the editor's canvas. */
function Frame({ children }: { readonly children: ReactNode }) {
  return (
    <View style={{ borderRadius: 8, borderCurve: 'continuous', overflow: 'hidden' }}>
      {children}
    </View>
  );
}

/** "Save current design", in a tile the size of a thumbnail; done once the design is saved. */
function SaveTile({
  width,
  height,
  saved,
  busy,
  onPress,
}: {
  readonly width: number;
  readonly height: number;
  readonly saved: boolean;
  readonly busy: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const disabled = saved || busy;
  const label = saved ? t('templates.savedCurrent') : t('templates.saveCurrent');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height,
        padding: 8,
        gap: 8,
        borderRadius: 8,
        borderCurve: 'continuous',
        borderWidth: 1.5,
        borderStyle: saved ? 'solid' : 'dashed',
        borderColor: saved ? colors.separator : colors.tint,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator />
      ) : (
        <SymbolView
          name={saved ? { ios: 'checkmark', android: 'check' } : { ios: 'plus', android: 'add' }}
          size={24}
          tintColor={saved ? colors.secondaryLabel : colors.tint}
        />
      )}
      <Text
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.3}
        importantForAccessibility="no"
        style={{
          color: saved ? colors.secondaryLabel : colors.tint,
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
