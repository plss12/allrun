import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';

import { roundSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { Spinner } from '@/ui/spinner';
import { INTERFACE_FACES, MAX_FONT_SCALE, Text } from '@/ui/text';

/** How tall the account screens' fields and buttons are: easy to hit, the same everywhere. */
export const ACCOUNT_CONTROL_HEIGHT = 56;

/** The faint edge of the account screens' fields and buttons. */
const EDGE = 'rgba(235, 235, 245, 0.28)';

/**
 * A field of the account screens: its label over it, and a dark box with a faint edge, the label
 * again as its placeholder. A password one has a button to show what was typed.
 */
export function AccountField({
  label,
  secret = false,
  ...props
}: {
  readonly label: string;
  readonly secret?: boolean;
} & Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'onSubmitEditing'
  | 'autoComplete'
  | 'textContentType'
  | 'keyboardType'
  | 'returnKeyType'
  | 'editable'
  | 'placeholder'
>) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <Text importantForAccessibility="no" style={{ color: colors.label, fontSize: 17 }}>
        {label}
      </Text>
      <View
        style={{
          height: ACCOUNT_CONTROL_HEIGHT,
          borderRadius: 12,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: EDGE,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 18,
        }}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholder={props.placeholder ?? label}
          placeholderTextColor={colors.tertiaryLabel}
          secureTextEntry={secret && !shown}
          autoCapitalize="none"
          autoCorrect={false}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{
            flex: 1,
            height: '100%',
            color: colors.label,
            fontFamily: INTERFACE_FACES.regular,
            fontSize: 17,
            paddingRight: secret ? 0 : 18,
          }}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(shown ? 'account.hidePassword' : 'account.showPassword')}
            onPress={() => setShown((was) => !was)}
            hitSlop={8}
            style={({ pressed }) => ({
              height: ACCOUNT_CONTROL_HEIGHT,
              paddingHorizontal: 18,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: colors.secondaryLabel, fontSize: 15, fontWeight: '600' }}>
              {t(shown ? 'account.hide' : 'account.show')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A button of the account screens, as wide as they are: `primary` in Track Red, for what the form
 * does, signing up and signing out; `danger`, the app's usual surface with words in the danger
 * red, for deleting the account;
 * `outlined`, a faint edge on the background, for another way in, with that provider's `mark`
 * before its words. While `busy` it shows a spinner and takes no taps.
 */
export function AccountButton({
  label,
  onPress,
  kind,
  mark,
  busy = false,
  disabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind: 'primary' | 'danger' | 'outlined';
  readonly mark?: ReactNode;
  readonly busy?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        ...(kind === 'outlined'
          ? { borderWidth: 1, borderColor: EDGE }
          : kind === 'danger'
            ? roundSurface(ACCOUNT_CONTROL_HEIGHT)
            : { backgroundColor: colors.tint }),
        height: ACCOUNT_CONTROL_HEIGHT,
        borderRadius: ACCOUNT_CONTROL_HEIGHT / 2,
        borderCurve: 'circular',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {busy ? (
        <Spinner color={colors.label} />
      ) : (
        <>
          {mark}
          <Text
            numberOfLines={1}
            importantForAccessibility="no"
            style={{
              color: kind === 'danger' ? colors.error : colors.label,
              fontSize: 17,
              fontWeight: '600',
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** A line across with a word in its middle ("or"), between two ways in. */
export function AccountDivider({ label }: { readonly label: string }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: EDGE }} />
      <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: EDGE }} />
    </View>
  );
}

/** A link of the account screens: a line of text that does something, in Track Red. */
export function AccountLink({
  label,
  onPress,
  align = 'center',
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly align?: 'center' | 'start';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        alignSelf: align === 'center' ? 'center' : 'flex-start',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: colors.tint, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
