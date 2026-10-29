import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RoundButton } from './round-button';

/** Room between the buttons of the top corners. */
export const TOP_BAR_GAP = 8;

interface EditorTopBarProps {
  readonly onClose: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onStartOver: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canStartOver: boolean;
}

/**
 * The editor's top left corner, floating over the canvas (ADR 009): close, with undo, redo and
 * Start over in a column under it, each apart from the others.
 */
export function EditorTopBar(props: EditorTopBarProps) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="toolbar" style={{ gap: TOP_BAR_GAP }}>
      <RoundButton
        icon={{ ios: 'xmark', android: 'close' }}
        label={t('editor.close')}
        onPress={props.onClose}
      />
      <RoundButton
        icon={{ ios: 'arrow.uturn.backward', android: 'undo' }}
        label={t('editor.undo')}
        onPress={props.onUndo}
        disabled={!props.canUndo}
      />
      <RoundButton
        icon={{ ios: 'arrow.uturn.forward', android: 'redo' }}
        label={t('editor.redo')}
        onPress={props.onRedo}
        disabled={!props.canRedo}
      />
      <RoundButton
        icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt' }}
        label={t('editor.restore')}
        onPress={props.onStartOver}
        disabled={!props.canStartOver}
      />
    </View>
  );
}
