import { SymbolView } from 'expo-symbols';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { CanvasFormat, DesignLanguage } from '@/core/template';
import type { DistanceUnit } from '@/core/units';
import { SportGlyph, type SportIconName } from '@/ui/sport-glyph';

import { TOP_BAR_GAP } from './editor-top-bar';
import { FormatMenu } from './format-menu';
import { FLOATING_INK, KeptMounted, ROUND_BUTTON_SIZE, RoundButton } from './round-button';

/** How long the buttons' names stay next to them after the column opens. */
const LABELS_MS = 3000;

interface EditorSideMenuProps {
  readonly format: CanvasFormat;
  /** Whether the formats' panel is open (the editor closes it on a tap anywhere else). */
  readonly formatsOpen: boolean;
  readonly onFormatsOpenChange: (open: boolean) => void;
  readonly onPickFormat: (format: CanvasFormat) => void;
  readonly onAddImage: () => void;
  readonly onDepth: () => void;
  readonly onCollages: () => void;
  readonly onDesigns: () => void;
  readonly onActivity: () => void;
  /** The Activity button's icon: the activity's sport, or `null` for a period's calendar. */
  readonly sport: SportIconName | null;
  /** The design's distance unit, and switching it (km and mi) for every widget. */
  readonly units: DistanceUnit;
  readonly onToggleUnits: () => void;
  /** The language of the design's widgets, and switching it (es and en). */
  readonly language: DesignLanguage;
  readonly onToggleLanguage: () => void;
}

/** Each language by its own name, as anyone looking for theirs reads it. */
const LANGUAGE_NAMES: Readonly<Record<DesignLanguage, string>> = {
  en: 'English',
  es: 'Español',
};

/**
 * The top right corner of the editor (ADR 009): adding an image, the depth effect and a chevron in
 * a row, and under them the design's menus in a column, Collages, Designs, Ratio (the format, as
 * "9:16"), the unit ("KM") and the language ("ES") of every widget, each switched with a tap, and
 * Activity, which the chevron unfolds (it starts folded, leaving the photo clear).
 * Every button is the size of the top left ones. The menus' names show next to them for a moment
 * when the column opens, then only the icons stay.
 */
export function EditorSideMenu({
  format,
  formatsOpen,
  onFormatsOpenChange,
  onPickFormat,
  onAddImage,
  onDepth,
  onCollages,
  onDesigns,
  onActivity,
  sport,
  units,
  onToggleUnits,
  language,
  onToggleLanguage,
}: EditorSideMenuProps) {
  const { t } = useTranslation();
  // Folded at first, so the photo shows whole; the names show when the user opens it.
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState(false);
  useEffect(() => {
    if (!labels) {
      return;
    }
    const timer = setTimeout(() => setLabels(false), LABELS_MS);
    return () => clearTimeout(timer);
  }, [labels]);
  const showLabels = labels && open && !formatsOpen;

  const toggle = () => {
    onFormatsOpenChange(false);
    setLabels(!open);
    setOpen(!open);
  };

  return (
    <View pointerEvents="box-none" style={{ alignItems: 'flex-end', gap: TOP_BAR_GAP + 4 }}>
      <View accessibilityRole="toolbar" style={{ flexDirection: 'row', gap: TOP_BAR_GAP }}>
        <RoundButton
          icon={{ ios: 'photo.badge.plus', android: 'add_photo_alternate' }}
          label={t('editor.addImage')}
          onPress={onAddImage}
        />
        <RoundButton
          icon={{ ios: 'person.and.background.dotted', android: 'portrait' }}
          label={t('editor.depth')}
          onPress={onDepth}
        />
        <RoundButton label={t(open ? 'editor.hideMenu' : 'editor.showMenu')} onPress={toggle}>
          <SymbolView
            name={
              open
                ? { ios: 'chevron.up', android: 'expand_less' }
                : { ios: 'chevron.down', android: 'expand_more' }
            }
            size={18}
            weight="bold"
            tintColor={FLOATING_INK}
          />
        </RoundButton>
      </View>
      <KeptMounted hidden={!open} style={{ alignItems: 'flex-end', gap: TOP_BAR_GAP }}>
        <Item label={t('editor.collages')} showLabel={showLabels}>
          <RoundButton
            icon={{ ios: 'rectangle.split.2x2', android: 'auto_awesome_mosaic' }}
            label={t('editor.collages')}
            onPress={onCollages}
          />
        </Item>
        <Item label={t('editor.designs')} showLabel={showLabels}>
          <RoundButton
            icon={{ ios: 'square.split.bottomrightquarter', android: 'space_dashboard' }}
            label={t('editor.designs')}
            onPress={onDesigns}
          />
        </Item>
        <Item label={t('editor.ratio')} showLabel={showLabels}>
          {formatsOpen && open ? (
            <View style={{ position: 'absolute', top: 0, right: ROUND_BUTTON_SIZE + TOP_BAR_GAP }}>
              <FormatMenu format={format} onPick={onPickFormat} />
            </View>
          ) : null}
          <RoundButton
            label={`${t('editor.ratio')}, ${t(`formats.${format}`)}`}
            onPress={() => onFormatsOpenChange(!formatsOpen)}
            selected={formatsOpen}
          >
            <ButtonText>{t(`formatRatios.${format}`)}</ButtonText>
          </RoundButton>
        </Item>
        <Item label={t('editor.units')} showLabel={showLabels}>
          <RoundButton
            label={`${t('editor.units')}, ${t(`editor.unitNames.${units}`)}`}
            onPress={onToggleUnits}
          >
            <ButtonText>{units.toUpperCase()}</ButtonText>
          </RoundButton>
        </Item>
        <Item label={t('editor.language')} showLabel={showLabels}>
          <RoundButton
            label={`${t('editor.language')}, ${LANGUAGE_NAMES[language]}`}
            onPress={onToggleLanguage}
          >
            <ButtonText>{language.toUpperCase()}</ButtonText>
          </RoundButton>
        </Item>
        <Item
          label={t(sport === null ? 'editor.period' : 'editor.activity')}
          showLabel={showLabels}
        >
          <RoundButton
            label={t(sport === null ? 'editor.period' : 'editor.activity')}
            onPress={onActivity}
            icon={sport === null ? { ios: 'calendar', android: 'calendar_month' } : undefined}
          >
            {sport === null ? null : <SportGlyph icon={sport} size={22} color={FLOATING_INK} />}
          </RoundButton>
        </Item>
      </KeptMounted>
    </View>
  );
}

/** A few letters in place of a button's icon: the ratio, the unit, the language. */
function ButtonText({ children }: { readonly children: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      maxFontSizeMultiplier={1}
      style={{
        color: FLOATING_INK,
        fontSize: 13,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
        paddingHorizontal: 3,
      }}
    >
      {children}
    </Text>
  );
}

/** A button of the column, with its name on its left while the names show. */
function Item({
  label,
  showLabel,
  children,
}: {
  readonly label: string;
  readonly showLabel: boolean;
  readonly children: ReactNode;
}) {
  return (
    <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {showLabel ? (
        <Animated.Text
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(300)}
          pointerEvents="none"
          importantForAccessibility="no"
          accessibilityElementsHidden
          maxFontSizeMultiplier={1.3}
          style={{
            color: FLOATING_INK,
            fontSize: 17,
            fontWeight: '600',
            textShadowColor: 'rgba(0, 0, 0, 0.6)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          }}
        >
          {label}
        </Animated.Text>
      ) : null}
      {children}
    </View>
  );
}
