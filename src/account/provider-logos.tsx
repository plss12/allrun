import { Canvas, Group, Path } from '@shopify/react-native-skia';

/**
 * The marks of the providers to sign in with, as each asks its buttons to show them, in vector:
 * Google's "G" in its four colors (from Google's own sign-in button,
 * `gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg`, 120 units square) and Apple's logo
 * (from Simple Icons, CC0, 24 units square), in white on the app's dark buttons.
 */

const GOOGLE_PARTS = [
  {
    color: '#4285F4',
    path: 'M117.6,61.3636364 C117.6,57.1090909 117.218182,53.0181818 116.509091,49.0909091 L60,49.0909091 L60,72.3 L92.2909091,72.3 C90.9,79.8 86.6727273,86.1545455 80.3181818,90.4090909 L80.3181818,105.463636 L99.7090909,105.463636 C111.054545,95.0181818 117.6,79.6363636 117.6,61.3636364 Z',
  },
  {
    color: '#34A853',
    path: 'M60,120 C76.2,120 89.7818182,114.627273 99.7090909,105.463636 L80.3181818,90.4090909 C74.9454545,94.0090909 68.0727273,96.1363636 60,96.1363636 C44.3727273,96.1363636 31.1454545,85.5818182 26.4272727,71.4 L6.38181818,71.4 L6.38181818,86.9454545 C16.2545455,106.554545 36.5454545,120 60,120 Z',
  },
  {
    color: '#FBBC05',
    path: 'M26.4272727,71.4 C25.2272727,67.8 24.5454545,63.9545455 24.5454545,60 C24.5454545,56.0454545 25.2272727,52.2 26.4272727,48.6 L26.4272727,33.0545455 L6.38181818,33.0545455 C2.31818182,41.1545455 0,50.3181818 0,60 C0,69.6818182 2.31818182,78.8454545 6.38181818,86.9454545 L26.4272727,71.4 Z',
  },
  {
    color: '#EA4335',
    path: 'M60,23.8636364 C68.8090909,23.8636364 76.7181818,26.8909091 82.9363636,32.8363636 L100.145455,15.6272727 C89.7545455,5.94545455 76.1727273,0 60,0 C36.5454545,0 16.2545455,13.4454545 6.38181818,33.0545455 L26.4272727,48.6 C31.1454545,34.4181818 44.3727273,23.8636364 60,23.8636364 Z',
  },
] as const;

const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

/** Google's "G", `size` points square. */
export function GoogleMark({ size }: { readonly size: number }) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 120 }]}>
        {GOOGLE_PARTS.map(({ color, path }) => (
          <Path key={color} path={path} color={color} />
        ))}
      </Group>
    </Canvas>
  );
}

/** Apple's logo, `size` points square, in `color`. */
export function AppleMark({ size, color }: { readonly size: number; readonly color: string }) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 24 }]}>
        <Path path={APPLE_PATH} color={color} />
      </Group>
    </Canvas>
  );
}
