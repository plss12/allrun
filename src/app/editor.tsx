import { useImage } from '@shopify/react-native-skia';
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';

import { customRange } from '@/core/dates';
import { defaultActivityTemplate, defaultSummaryTemplate } from '@/core/default-layout';
import { DEFAULT_FRAMING, type PhotoFraming, type Size } from '@/core/photo-framing';
import { bucketForPeriod } from '@/core/periods';
import { bucketize, summarize } from '@/core/summary';
import { type CanvasFormat, CANVAS_FORMATS } from '@/core/template';
import { useActivitySource } from '@/data/activity-source';
import { EditorCanvas } from '@/editor/editor-canvas';
import type { EditorData } from '@/editor/editor-data';
import { useEditorFonts } from '@/editor/fonts';
import type { PickedPhoto } from '@/editor/photo-plan';
import { PhotoPreview } from '@/editor/photo-preview';
import { preparePhoto } from '@/editor/prepare-photo';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
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

/** The chosen photo and the state of the copy Skia draws. */
interface EditorPhoto {
  /** Increases with every pick, so a slow preparation of a replaced photo is ignored. */
  readonly id: number;
  readonly picked: PickedPhoto;
  /** URI Skia decodes; `null` while it is being prepared (the system viewer shows the photo). */
  readonly canvasUri: string | null;
  readonly reencoded: boolean;
}

const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];

export default function Editor() {
  const { t } = useTranslation();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  const paramsError = params.success ? null : z.prettifyError(params.error);
  useEffect(() => {
    if (paramsError !== null) {
      logError('Invalid editor route params', paramsError);
    }
  }, [paramsError]);
  if (!params.success) {
    return <ErrorView message={t('editor.error')} />;
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
      <ErrorView message={t('editor.error')} onRetry={data.retry} />
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
  const [photo, setPhoto] = useState<EditorPhoto | null>(null);
  const [previewSize, setPreviewSize] = useState<Size | null>(null);
  const [framing] = useState<PhotoFraming>(DEFAULT_FRAMING);
  const [photoError, setPhotoError] = useState(false);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [nextPhotoId, setNextPhotoId] = useState(1);

  /** Prepares a photo for Skia in the background; results for a replaced photo are dropped. */
  const prepareForCanvas = async (id: number, picked: PickedPhoto, force: boolean) => {
    try {
      const uri = await preparePhoto(picked, force);
      setPhoto((current) =>
        current?.id === id ? { ...current, canvasUri: uri, reencoded: force } : current,
      );
    } catch (error) {
      logError('Could not prepare the photo', error);
      setPhoto((current) => (current?.id === id ? null : current));
      setPhotoError(true);
    }
  };

  const canvasImage = useImage(photo?.canvasUri, (error) => {
    if (photo !== null && !photo.reencoded) {
      // Skia could not decode the file as picked: re-encode it once and try again, while the
      // system viewer keeps showing the photo.
      logError('Could not decode the photo, re-encoding it', error);
      setPhoto({ ...photo, canvasUri: null });
      void prepareForCanvas(photo.id, photo.picked, true);
    } else {
      logError('Could not decode the re-encoded photo', error);
      setPhoto(null);
      setPhotoError(true);
    }
  });

  const template =
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(bucketForPeriod(data.kind, data.summary.range), format);
  const size = CANVAS_FORMATS[format];
  const displayWidth =
    area === null ? 0 : Math.min(area.width, (area.height * size.width) / size.height);

  const pickPhoto = async () => {
    setPhotoError(false);
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        // Keep the original file (HEIC included); preparePhoto re-encodes it once if needed,
        // instead of the picker transcoding every photo.
        preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (!result.canceled && result.assets.length > 0) {
        const picked = result.assets[0];
        const id = nextPhotoId;
        setNextPhotoId(id + 1);
        // Shown at once by the system viewer, which reads every format (HEIC included); Skia
        // takes over as soon as its copy is ready, with the same framing.
        setPreviewSize(null);
        setPhoto({ id, picked, canvasUri: null, reencoded: false });
        void prepareForCanvas(id, picked, false);
      }
    } catch (error) {
      logError('Could not open the photo library', error);
      setPhotoError(true);
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
            {photo !== null && canvasImage === null ? (
              <PhotoPreview
                uri={photo.picked.uri}
                size={previewSize}
                onSize={setPreviewSize}
                canvas={size}
                ratio={displayWidth / size.width}
                framing={framing}
              />
            ) : null}
            <EditorCanvas
              displayWidth={displayWidth}
              template={template}
              data={data}
              background={
                canvasImage !== null
                  ? { kind: 'photo', image: canvasImage, framing }
                  : photo !== null
                    ? { kind: 'none' }
                    : { kind: 'placeholder' }
              }
              fonts={fonts}
              textContext={{ unit, locale }}
              translate={(key) => t(key)}
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 }}>
        {photoError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}
          >
            {t('editor.photoError')}
          </Text>
        ) : null}
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
            {photo === null ? t('editor.choosePhoto') : t('editor.changePhoto')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
