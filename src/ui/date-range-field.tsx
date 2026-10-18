import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import type { DateRange, LocalDate } from '@/core/dates';
import type { DateLimits } from '@/core/periods';
import { colors } from '@/theme/colors';

import { formatDate } from './format';
import { fromLocalDate, toLocalDate } from './today';

type RangeEnd = 'start' | 'end';

interface DateRangeFieldProps {
  readonly range: DateRange;
  /** Dates each end can take while the other stays. */
  readonly limits: { readonly start: DateLimits; readonly end: DateLimits };
  /** What each end is ("From", "To"), for screen readers: on screen the dates speak for themselves. */
  readonly labels: { readonly start: string; readonly end: string };
  readonly locale: string;
  readonly onChange: (end: RangeEnd, date: LocalDate) => void;
}

/**
 * A date range as its two dates with a dash between them, each picked with the system's
 * calendar: on iOS it unfolds under the dates (as in the Calendar app), on Android it opens as a
 * dialog. Dates outside the limits can't be picked.
 *
 * The dates are our own buttons rather than iOS's compact picker, whose native frame is wider
 * than the date it shows and pins it to one side, so the dash could never sit centered.
 */
export function DateRangeField({ range, limits, labels, locale, onChange }: DateRangeFieldProps) {
  /** The end whose calendar is open on iOS. */
  const [editing, setEditing] = useState<RangeEnd | null>(null);
  const pick = (end: RangeEnd, date: Date | undefined) => {
    if (date !== undefined) {
      onChange(end, toLocalDate(date));
    }
  };
  const open = (end: RangeEnd) => {
    if (Platform.OS === 'ios') {
      setEditing((current) => (current === end ? null : end));
      return;
    }
    DateTimePickerAndroid.open({
      mode: 'date',
      value: fromLocalDate(range[end]),
      minimumDate: fromLocalDate(limits[end].min),
      maximumDate: fromLocalDate(limits[end].max),
      onValueChange: (_event, date) => pick(end, date),
    });
  };
  const button = (end: RangeEnd) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${labels[end]}: ${formatDate(range[end], locale)}`}
      accessibilityState={{ expanded: Platform.OS === 'ios' ? editing === end : undefined }}
      onPress={() => open(end)}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderCurve: 'continuous',
        justifyContent: 'center',
        backgroundColor: colors.secondarySystemBackground,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={{
          color: editing === end ? colors.tint : colors.label,
          fontSize: 17,
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatDate(range[end], locale)}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}
      >
        {button('start')}
        <View
          importantForAccessibility="no"
          style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: colors.label }}
        />
        {button('end')}
      </View>
      {editing === null ? null : (
        <DateTimePicker
          key={editing}
          mode="date"
          display="inline"
          value={fromLocalDate(range[editing])}
          minimumDate={fromLocalDate(limits[editing].min)}
          maximumDate={fromLocalDate(limits[editing].max)}
          locale={locale}
          accentColor={colors.tint}
          onValueChange={(_event, date) => pick(editing, date)}
        />
      )}
    </View>
  );
}
