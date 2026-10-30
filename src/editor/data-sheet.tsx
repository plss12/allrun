import { useTranslation } from 'react-i18next';
import { FlatList, Modal, ScrollView, useWindowDimensions } from 'react-native';

import type { PeriodKind } from '@/core/periods';
import { useActivitySource } from '@/data/activity-source';
import { ActivityCard } from '@/home/activity-card';
import { type PeriodChoice, PeriodCard } from '@/home/period-card';
import { useDisplaySettings } from '@/ui/settings';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { todayLocal } from '@/ui/today';
import { useAsync } from '@/ui/use-async';

import { SheetFrame } from './sheet-frame';

/** How many recent activities the sheet offers, as the home screen. */
const RECENT_LIMIT = 50;
const PERIODS: readonly PeriodKind[] = ['week', 'month', 'year', 'custom'];
const PADDING = 16;
const GAP = 12;

/**
 * Sheet to fill the design with another activity or period, keeping it (ADR 011): the home
 * screen's cards, the recent activities or the period cards, a tap choosing one. Its content is
 * only mounted, and loaded, while it shows.
 */
export function DataSheet({
  visible,
  mode,
  onChooseActivity,
  onChoosePeriod,
  onClose,
}: {
  readonly visible: boolean;
  readonly mode: 'activity' | 'summary';
  readonly onChooseActivity: (id: string) => void;
  readonly onChoosePeriod: (choice: PeriodChoice) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <SheetFrame
        title={t(mode === 'activity' ? 'editor.chooseActivity' : 'editor.choosePeriod')}
        closeLabel={t('editor.close')}
        onClose={onClose}
      >
        {!visible ? null : mode === 'activity' ? (
          <Activities onChoose={onChooseActivity} />
        ) : (
          <Periods onChoose={onChoosePeriod} />
        )}
      </SheetFrame>
    </Modal>
  );
}

/** The recent activities, newest first, as on the home screen. */
function Activities({ onChoose }: { readonly onChoose: (id: string) => void }) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const recent = useAsync(() => source.listRecent(RECENT_LIMIT), 'recent');
  const { unit, locale } = useDisplaySettings();
  const { width } = useWindowDimensions();
  const today = todayLocal();
  if (recent.status === 'loading') {
    return <LoadingView />;
  }
  if (recent.status === 'error') {
    return <ErrorView message={t('home.error')} onRetry={recent.retry} />;
  }
  return (
    <FlatList
      data={recent.data}
      keyExtractor={(activity) => activity.id}
      contentContainerStyle={{ padding: PADDING, gap: GAP, flexGrow: 1 }}
      ListEmptyComponent={<EmptyView message={t('home.empty')} />}
      renderItem={({ item }) => (
        <ActivityCard
          activity={item}
          width={width - 2 * PADDING}
          today={today}
          unit={unit}
          locale={locale}
          onPress={() => onChoose(item.id)}
        />
      )}
    />
  );
}

/** A card per period, as on the home screen, each page choosing its period and sport. */
function Periods({ onChoose }: { readonly onChoose: (choice: PeriodChoice) => void }) {
  const { unit, locale } = useDisplaySettings();
  const { width } = useWindowDimensions();
  const today = todayLocal();
  return (
    <ScrollView contentContainerStyle={{ padding: PADDING, gap: 16 }}>
      {PERIODS.map((kind) => (
        <PeriodCard
          key={kind}
          kind={kind}
          width={width - 2 * PADDING}
          today={today}
          unit={unit}
          locale={locale}
          onChoose={onChoose}
        />
      ))}
    </ScrollView>
  );
}
