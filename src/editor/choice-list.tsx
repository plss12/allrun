import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  CHAT_PHRASES,
  type DesignLanguage,
  MAX_CHAT_LENGTH,
  QUOTES,
  VERSES,
} from '@/core/template';
import type { ChosenWords } from '@/core/template-edit';
import { cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';

import { SheetFrame } from './sheet-frame';
import { GALLERY_GAP, GALLERY_PADDING } from './widget-gallery';

/** The title of each list to choose from. */
export const CHOICE_TITLES = {
  verse: 'gallery.chooseVerse',
  quote: 'gallery.chooseQuote',
  chat: 'gallery.chooseChat',
} as const;

/** One entry of a list to choose from: its words, where they come from, and the widget's. */
interface ChoiceEntry {
  readonly key: string;
  readonly words: string;
  readonly source: string | null;
  readonly block: ChosenWords;
}

/** The key of the entry `words` are, or `null` for the user's own phrase. */
function entryKey(words: ChosenWords): string | null {
  switch (words.design) {
    case 'verse':
      return words.verse;
    case 'quote':
      return words.quote;
    case 'chat':
      return typeof words.phrase === 'string' ? words.phrase : null;
  }
}

/**
 * The verses, quotes or phrases to choose from, each on a card: a verse's or a quote's words in
 * quotation marks, and where they come from or who said them under them; a phrase as it is, after
 * a field to write one's own. The list is the one of `words`, and a chat's phrase keeps its look.
 * They read in the design's language. A tap chooses one. When the widget is already on the canvas (`marked`), its words are marked,
 * and shown, and its own phrase is in the field.
 */
export function ChoiceList({
  words,
  language,
  marked = false,
  onChoose,
}: {
  readonly words: ChosenWords;
  /** The design's language, the widget's words are in: the list shows them as they will be. */
  readonly language: DesignLanguage;
  readonly marked?: boolean;
  readonly onChoose: (words: ChosenWords) => void;
}) {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT(language);
  const entries = ((): ChoiceEntry[] => {
    switch (words.design) {
      case 'verse':
        return VERSES.map((verse) => ({
          key: verse,
          words: t('widgets.quoted', { text: t(`widgets.verses.${verse}.text`) }),
          source: t(`widgets.verses.${verse}.source`),
          block: { design: 'verse', verse },
        }));
      case 'quote':
        return QUOTES.map((quote) => ({
          key: quote,
          words: t('widgets.quoted', { text: t(`widgets.quotes.${quote}.text`) }),
          source: t(`widgets.quotes.${quote}.author`),
          block: { design: 'quote', quote },
        }));
      case 'chat':
        return CHAT_PHRASES.map((phrase) => ({
          key: phrase,
          words: t(`widgets.phrases.${phrase}`),
          source: null,
          block: { ...words, phrase },
        }));
    }
  })();
  const markedKey = marked ? entryKey(words) : null;
  // The marked entry is scrolled to once, when it is first laid out.
  const scroll = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: GALLERY_PADDING, gap: GALLERY_GAP, paddingBottom: 32 }}
    >
      {words.design === 'chat' ? (
        <OwnPhrase
          initial={marked && typeof words.phrase !== 'string' ? words.phrase.own : ''}
          onAdd={(own) => onChoose({ ...words, phrase: { own } })}
        />
      ) : null}
      {entries.map((entry) => {
        const isMarked = entry.key === markedKey;
        return (
          <Pressable
            key={entry.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isMarked }}
            accessibilityLabel={
              entry.source === null ? entry.words : `${entry.words} ${entry.source}`
            }
            onPress={() => onChoose(entry.block)}
            onLayout={
              isMarked
                ? (event) => {
                    if (!scrolled.current) {
                      scrolled.current = true;
                      const y = Math.max(0, event.nativeEvent.layout.y - GALLERY_PADDING);
                      scroll.current?.scrollTo({ y, animated: false });
                    }
                  }
                : undefined
            }
            style={({ pressed }) => ({
              ...cardSurface(14),
              ...(isMarked ? { borderColor: colors.tint, borderWidth: 2 } : {}),
              paddingHorizontal: 18,
              paddingVertical: 16,
              gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: colors.label, fontSize: 17, lineHeight: 23 }}>{entry.words}</Text>
            {entry.source === null ? null : (
              <Text style={{ color: colors.secondaryLabel, fontSize: 15, fontStyle: 'italic' }}>
                {entry.source}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A card to write one's own phrase, and its button to add it, on once there is something. */
function OwnPhrase({
  initial,
  onAdd,
}: {
  readonly initial: string;
  readonly onAdd: (phrase: string) => void;
}) {
  const { t } = useTranslation();
  const [phrase, setPhrase] = useState(initial);
  const written = phrase.trim();
  const add = () => {
    if (written !== '') {
      onAdd(written);
    }
  };
  return (
    <View
      style={{
        ...cardSurface(14),
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <TextInput
        value={phrase}
        onChangeText={setPhrase}
        onSubmitEditing={add}
        placeholder={t('gallery.ownPhrase')}
        placeholderTextColor={colors.secondaryLabel}
        accessibilityLabel={t('gallery.ownPhrase')}
        maxLength={MAX_CHAT_LENGTH}
        returnKeyType="done"
        style={{ flex: 1, color: colors.label, fontSize: 17, paddingVertical: 8 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: written === '' }}
        disabled={written === ''}
        onPress={add}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: written === '' ? 0.35 : pressed ? 0.6 : 1 })}
      >
        <Text style={{ color: colors.tint, fontSize: 17, fontWeight: '600' }}>
          {t('gallery.addOwnPhrase')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The list of a widget already on the canvas, to choose other words for it (a tap on it once
 * selected, or its Edit button), while `words` is set. It keeps showing the last words as it
 * slides away.
 */
export function ChoiceSheet({
  words,
  language,
  onChoose,
  onClose,
}: {
  readonly words: ChosenWords | null;
  readonly language: DesignLanguage;
  readonly onChoose: (words: ChosenWords) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(words);
  if (words !== null && words !== shown) {
    setShown(words);
  }
  return (
    <Modal
      visible={words !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      // Android shows it full screen: drawn under the system bars, padded by their insets.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {shown === null ? null : (
        <SheetFrame
          title={t(CHOICE_TITLES[shown.design])}
          closeLabel={t('editor.close')}
          onClose={onClose}
        >
          {/* Keyed by the widget's words, so each opening scrolls to its own. */}
          <ChoiceList
            key={JSON.stringify(shown)}
            words={shown}
            language={language}
            marked
            onChoose={onChoose}
          />
        </SheetFrame>
      )}
    </Modal>
  );
}
