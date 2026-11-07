import { NotificationFeedbackType, notificationAsync } from 'expo-haptics';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, View } from 'react-native';

import { Spinner } from '@/ui/spinner';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { Text } from '@/ui/text';

import { exportLabels } from './action-labels';
import { ACTION_TILE_HEIGHT, ActionTile } from './action-tile';
import { ACTION_TILE_GAP, actionLabelSize } from './editor-layout';
import { copyImage, saveToPhotos, shareImage } from './export-actions';
import { encodeBase64 } from './export-image';
import type { ExportState } from './use-export';

/** How long a tile reads "Saved" or "Copied" after its action. */
const DONE_MS = 2000;

/** Says that the image can't be saved without permission, with the way to the settings. */
/** The texts the alert of a missing permission reads, by their keys. */
type PermissionAlertKey =
  | 'export.noPermissionTitle'
  | 'export.noPermissionMessage'
  | 'editor.cancel'
  | 'export.openSettings';

export function alertNoPhotosPermission(t: (key: PermissionAlertKey) => string): void {
  Alert.alert(t('export.noPermissionTitle'), t('export.noPermissionMessage'), [
    { text: t('editor.cancel'), style: 'cancel' },
    {
      text: t('export.openSettings'),
      onPress: () => {
        Linking.openSettings().catch((error: unknown) => {
          logError('Could not open the settings', error);
        });
      },
    },
  ]);
}

/**
 * What to do with the exported image, in the row under the canvas, in this order (the user's): post
 * it as an Instagram story (`onStory`, coming soon: ADR 009), share it, save it to the photo
 * library, or copy it (how a transparent sticker reaches a story meanwhile). While the image is being prepared the row says
 * so; if that failed, it offers to try again.
 */
export function ExportBar({
  state,
  onRetry,
  onStory,
}: {
  readonly state: ExportState;
  readonly onRetry: () => void;
  readonly onStory: () => void;
}) {
  const { t } = useTranslation();
  /** An action is running: the others wait. */
  const [working, setWorking] = useState(false);
  /** The action that just finished, shown on its tile for a moment. */
  const [done, setDone] = useState<'saved' | 'copied' | null>(null);
  useEffect(() => {
    if (done === null) {
      return;
    }
    const timer = setTimeout(() => setDone(null), DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  if (state.status === 'idle' || state.status === 'rendering') {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{
          height: ACTION_TILE_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <Spinner />
        <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>{t('export.preparing')}</Text>
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          accessibilityRole="alert"
          style={{ flex: 2, color: colors.secondaryLabel, fontSize: 15 }}
        >
          {t('export.error')}
        </Text>
        <ActionTile
          icon="refresh"
          label={t('common.retry')}
          labelSize={actionLabelSize([t('common.retry')])}
          onPress={onRetry}
        />
      </View>
    );
  }

  const { exported } = state;
  /** Runs an action; failures are logged and told to the user. */
  const run = async (name: string, action: () => Promise<void>) => {
    setWorking(true);
    try {
      await action();
    } catch (error) {
      logError(`Could not ${name} the exported image`, error);
      Alert.alert(t('export.actionError'));
    } finally {
      setWorking(false);
    }
  };
  const succeed = (what: 'saved' | 'copied') => {
    setDone(what);
    notificationAsync(NotificationFeedbackType.Success).catch((error: unknown) => {
      logError('Could not play a haptic', error);
    });
  };

  const save = () =>
    run('save', async () => {
      if ((await saveToPhotos(exported.uri)) === 'saved') {
        succeed('saved');
        return;
      }
      alertNoPhotosPermission(t);
    });
  const share = () => run('share', () => shareImage(exported.uri, exported.encoding));
  const copy = () =>
    run('copy', async () => {
      await copyImage(encodeBase64(exported.image, exported.encoding));
      succeed('copied');
    });

  const labelSize = actionLabelSize(exportLabels((key) => t(key)));
  return (
    <View style={{ flexDirection: 'row', gap: ACTION_TILE_GAP }}>
      <ActionTile
        icon="instagram"
        label={t('export.story')}
        labelSize={labelSize}
        onPress={onStory}
        disabled={working}
      />
      <ActionTile
        icon="export"
        label={t('export.share')}
        labelSize={labelSize}
        onPress={() => void share()}
        disabled={working}
      />
      <ActionTile
        icon={done === 'saved' ? 'check' : 'save'}
        label={done === 'saved' ? t('export.saved') : t('export.save')}
        labelSize={labelSize}
        onPress={() => void save()}
        disabled={working}
      />
      <ActionTile
        icon={done === 'copied' ? 'check' : 'copy'}
        label={done === 'copied' ? t('export.copied') : t('export.copy')}
        labelSize={labelSize}
        onPress={() => void copy()}
        disabled={working}
      />
    </View>
  );
}
