import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

interface SelectionBarProps {
  /** Rewrites the selected free text; absent for other layers. */
  readonly onEditText?: () => void;
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
  onEditText,
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
      style={{ flexDirection: 'row', justifyContent: 'center' }}
    >
      {onEditText === undefined ? null : (
        <Action
          icon={{ ios: 'character.cursor.ibeam', android: 'edit' }}
          label={t('editor.editText')}
          onPress={onEditText}
        />
      )}
      <Action
        icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
        label={t('editor.duplicate')}
        onPress={onDuplicate}
        disabled={!canDuplicate}
      />
      <Action
        icon={{ ios: 'square.3.layers.3d.top.filled', android: 'flip_to_front' }}
        label={t('editor.bringToFront')}
        onPress={onBringToFront}
        disabled={!canBringToFront}
      />
      <Action
        icon={{ ios: 'square.3.layers.3d.bottom.filled', android: 'flip_to_back' }}
        label={t('editor.sendToBack')}
        onPress={onSendToBack}
        disabled={!canSendToBack}
      />
      <Action
        icon={{ ios: 'trash', android: 'delete' }}
        label={t('editor.remove')}
        onPress={onRemove}
        destructive
      />
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  const color = destructive ? colors.error : colors.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        maxWidth: 84,
        minHeight: 52,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <SymbolView name={icon} size={22} tintColor={color} />
      <Text
        numberOfLines={1}
        importantForAccessibility="no"
        style={{ color, fontSize: 11, fontWeight: '500' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
