import { useImage } from '@shopify/react-native-skia';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';

import { customRange } from '@/core/dates';
import { defaultActivityTemplate, defaultSummaryTemplate } from '@/core/default-layout';
import { bucketForPeriod } from '@/core/periods';
import { bucketize, summarize } from '@/core/summary';
import { type CanvasFormat, CANVAS_FORMATS } from '@/core/template';
import { useActivitySource } from '@/data/activity-source';
import { EditorCanvas } from '@/editor/editor-canvas';
import type { EditorData } from '@/editor/editor-data';
import { useEditorFonts } from '@/editor/fonts';
import { colors } from '@/theme/colors';
import { useDisplaySettings } from '@/ui/settings';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { useAsync } from '@/ui/use-async';

/** Route params, validated: they can come from a deep link, not only from our own screens. */
const paramsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('activity'), activityId: z.string().min(1) }),
  z.object({
    mode: z.literal('summary'),
    kind: z.enum(['week', 'month', 'year', 'custom']),
    start: z.iso.date(),
    end: z.iso.date(),
    families: z
      .string()
      .transform((value) => (value === '' ? [] : value.split(',')))
      .pipe(z.array(z.enum(['run', 'ride', 'swim', 'other']))),
  }),
]);

class ActivityNotFoundError extends Error {}

const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];

export default function Editor() {
  const { t } = useTranslation();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  if (!params.success) {
    return (
      <ErrorView message={t('editor.error')} error={new Error(z.prettifyError(params.error))} />
    );
  }
  return <EditorScreen params={params.data} />;
}

function EditorScreen({ params }: { readonly params: z.infer<typeof paramsSchema> }) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const fonts = useEditorFonts();
  const data = useAsync(async (): Promise<EditorData> => {
    if (params.mode === 'activity') {
      const activity = await source.getActivity(params.activityId);
      if (activity === null) {
        throw new ActivityNotFoundError(`No activity with id ${params.activityId}`);
      }
      return { mode: 'activity', activity };
    }
    const range = customRange(params.start, params.end);
    const activities = await source.listInRange(range);
    const filter = params.families.length === 0 ? {} : { families: params.families };
    const bucketSize = bucketForPeriod(params.kind, range);
    return {
      mode: 'summary',
      kind: params.kind,
      summary: summarize(activities, range, filter),
      buckets: bucketize(activities, range, bucketSize, filter),
      bucketSize,
    };
  }, JSON.stringify(params));

  if (data.status === 'loading' || fonts === null) {
    return <LoadingView />;
  }
  if (data.status === 'error') {
    return data.error instanceof ActivityNotFoundError ? (
      <ErrorView message={t('editor.notFound')} />
    ) : (
      <ErrorView message={t('editor.error')} error={data.error} onRetry={data.retry} />
    );
  }
  return <EditorWorkspace data={data.data} fonts={fonts} />;
}

function EditorWorkspace({
  data,
  fonts,
}: {
  readonly data: EditorData;
  readonly fonts: NonNullable<ReturnType<typeof useEditorFonts>>;
}) {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  const [format, setFormat] = useState<CanvasFormat>('story');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<Error | null>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const photo = useImage(photoUri, (error) => setPhotoError(error));

  const template =
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(bucketForPeriod(data.kind, data.summary.range), format);
  const size = CANVAS_FORMATS[format];
  const displayWidth =
    area === null ? 0 : Math.min(area.width, (area.height * size.width) / size.height);

  const pickPhoto = async () => {
    setPhotoError(null);
    try {
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && result.assets.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      setPhotoError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.systemBackground }}>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setArea({ width: width - 32, height: height - 32 });
        }}
      >
        {displayWidth > 0 ? (
          <View
            style={{
              borderRadius: 12,
              borderCurve: 'continuous',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}
          >
            <EditorCanvas
              displayWidth={displayWidth}
              template={template}
              data={data}
              photo={photo}
              fonts={fonts}
              textContext={{ unit, locale }}
              translate={(key) => t(key)}
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 }}>
        {photoError === null ? null : (
          <Text selectable style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>
            {`${t('editor.photoError')}: ${photoError.message}`}
          </Text>
        )}
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
          accessibilityRole="tablist"
          accessibilityLabel={t('editor.format')}
        >
          {FORMATS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected: format === option }}
              onPress={() => setFormat(option)}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: format === option ? colors.tint : colors.secondarySystemBackground,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: format === option ? colors.onTint : colors.label,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                {t(`formats.${option}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={pickPhoto}
          style={({ pressed }) => ({
            backgroundColor: colors.tint,
            borderRadius: 14,
            borderCurve: 'continuous',
            padding: 14,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}>
            {photoUri === null ? t('editor.choosePhoto') : t('editor.changePhoto')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
