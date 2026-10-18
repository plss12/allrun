import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ActionTile } from './action-tile';

interface QuickActionsProps {
  readonly onAddLayer: () => void;
  readonly onAddText: () => void;
  /** Whether the design has room for one more layer. */
  readonly canAdd: boolean;
}

/** What to do under the canvas while designing and nothing is selected: add something. */
export function QuickActions({ onAddLayer, onAddText, canAdd }: QuickActionsProps) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <ActionTile
        icon={{ ios: 'plus.square', android: 'add_box' }}
        label={t('editor.addLayer')}
        onPress={onAddLayer}
        disabled={!canAdd}
      />
      <ActionTile
        icon={{ ios: 'textformat', android: 'title' }}
        label={t('editor.addText')}
        onPress={onAddText}
        disabled={!canAdd}
      />
    </View>
  );
}
