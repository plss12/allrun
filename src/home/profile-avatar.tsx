import { Image } from 'expo-image';
import { View } from 'react-native';

import { profileInitial } from '@/core/account';
import { useActivitySource, useActivitySourceKey } from '@/data/activity-source';
import { useAuth } from '@/data/auth';
import { useStrava } from '@/data/strava';
import { colors } from '@/theme/colors';
import { Text } from '@/ui/text';
import { TOP_BAR_HEIGHT } from '@/ui/top-bar';
import { useAsync } from '@/ui/use-async';

/** Room between the button's glass edge and the photo: the tabs' capsule's. */
const INSET = 4;
const SIZE = TOP_BAR_HEIGHT - 2 * INSET;

/**
 * What the profile's button shows (the owner's choice, as the apps people know: Strava,
 * Instagram): the athlete's Strava photo, or the first letter of their name, or of the account's
 * email, while there is none or it loads. The photo is kept on the phone by `expo-image`, and its
 * address by the activity source, a week.
 */
export function ProfileAvatar() {
  const source = useActivitySource();
  const sourceKey = useActivitySourceKey();
  const strava = useStrava();
  const auth = useAuth();
  const connected = strava.status === 'connected';
  // Without Strava there is no photo to ask for (the fixtures have none either).
  const photo = useAsync(
    () => (connected ? source.getAthletePhoto() : Promise.resolve(null)),
    `athlete-photo|${sourceKey}|${connected ? 'connected' : 'none'}`,
  );
  const url = photo.status === 'success' ? photo.data : null;
  const initial = profileInitial(
    connected ? strava.athleteName : '',
    auth.status === 'signedIn' ? (auth.email ?? '') : '',
  );
  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url === null ? (
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ color: colors.label, fontSize: 19, fontWeight: '600' }}
        >
          {initial ?? ''}
        </Text>
      ) : (
        <Image
          source={url}
          accessibilityIgnoresInvertColors
          cachePolicy="disk"
          transition={0}
          style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2 }}
        />
      )}
    </View>
  );
}
