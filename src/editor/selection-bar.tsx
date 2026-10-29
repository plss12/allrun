import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ActionTile } from './action-tile';

interface SelectionBarProps {
  /**
   * Rewrites the selected free text, or chooses another verse, quote or chat message's phrase;
   * absent for other layers.
   */
  readonly onEdit?: () => void;
  /** Opens the style panel; absent for layers without style options. */
  readonly onStyle?: () => void;
  readonly onDuplicate: () => void;
  readonly onBringToFront: () => void;
  readonly onSendToBack: () => void;
  readonly onRemove: () => void;
  readonly canDuplicate: boolean;
  readonly canBringToFront: boolean;
  readonly canSendToBack: boolean;
}

/**
 * Actions on the selected layer. Everything here can also be reached without gestures, so the
 * drag-to-trash has an accessible equivalent.
 */
export function SelectionBar({
  onEdit,
  onStyle,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onRemove,
  canDuplicate,
  canBringToFront,
  canSendToBack,
}: SelectionBarProps) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t('editor.selectedLayer')}
      style={{ flexDirection: 'row', gap: 6 }}
    >
      {onEdit === undefined ? null : (
        <ActionTile
          icon={{ ios: 'character.cursor.ibeam', android: 'edit' }}
          label={t('editor.editText')}
          onPress={onEdit}
        />
      )}
      {onStyle === undefined ? null : (
        <ActionTile
          icon={{ ios: 'paintbrush', android: 'palette' }}
          label={t('editor.style')}
          onPress={onStyle}
        />
      )}
      <ActionTile
        icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
        label={t('editor.duplicate')}
        onPress={onDuplicate}
        disabled={!canDuplicate}
      />
      <ActionTile
        icon={{ ios: 'square.3.layers.3d.top.filled', android: 'flip_to_front' }}
        label={t('editor.bringToFront')}
        onPress={onBringToFront}
        disabled={!canBringToFront}
      />
      <ActionTile
        icon={{ ios: 'square.3.layers.3d.bottom.filled', android: 'flip_to_back' }}
        label={t('editor.sendToBack')}
        onPress={onSendToBack}
        disabled={!canSendToBack}
      />
      <ActionTile
        icon={{ ios: 'trash', android: 'delete' }}
        label={t('editor.remove')}
        onPress={onRemove}
        destructive
      />
    </View>
  );
}
