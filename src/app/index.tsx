import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header">{t('home.title')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
