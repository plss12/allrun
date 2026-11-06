import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  FilterMode,
  Group,
  Image,
  LinearGradient,
  MipmapMode,
  Paint,
  Path,
  Picture,
  Rect,
  RoundedRect,
  Skia,
  type SkImage,
  type SkPicture,
  vec,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { DropShadow, textShadows } from './scene-text';

/**
 * The GPU's programs for what the widgets draw, made once while the launch screen covers the app.
 * Skia compiles a program the first time it draws each kind of thing (a blur of a given size, a
 * gradient of so many colors, an image with mipmaps) in each run of the app: on a modest phone,
 * the first opening of the widget gallery spent some 400 ms of the UI thread on that alone, and a
 * second one, already compiled, didn't (ADR 014). Under the launch screen, unseen, it costs no
 * frame anyone looks at.
 */

/** The scales the gallery's tiles and the editor draw widgets at: a blur's program goes by its size. */
const SCALES = [0.5, 1, 2] as const;
const CELL = 60;

/** A small image with its mipmaps, drawn as photos are, and a text with its shadow, as a picture. */
function useWarmupAssets(): { readonly image: SkImage | null; readonly text: SkPicture } {
  return useMemo(() => {
    const surface = Skia.Surface.Make(64, 64);
    let image: SkImage | null = null;
    if (surface !== null) {
      surface.getCanvas().clear(Skia.Color('#C94A2E'));
      image = surface.makeImageSnapshot();
    }
    const builder = Skia.ParagraphBuilder.Make({});
    builder.pushStyle({
      color: Skia.Color('#FFFFFF'),
      fontSize: 24,
      shadows: textShadows('#FFFFFF'),
    });
    builder.addText('10.81 KM');
    builder.pop();
    const paragraph = builder.build();
    paragraph.layout(400);
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(-100, -100, 600, 300));
    paragraph.paint(canvas, 0, 0);
    const text = recorder.finishRecordingAsPicture();
    recorder.dispose();
    paragraph.dispose();
    return { image, text };
  }, []);
}

/** Draws, once and out of sight, one of each kind of thing a widget draws, at each scale. */
export function ShaderWarmup() {
  const { image, text } = useWarmupAssets();
  const route = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    builder.moveTo(4, 50);
    builder.cubicTo(20, 0, 40, 60, 56, 10);
    return builder.detach();
  }, []);
  return (
    <Canvas
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: CELL * 4,
        height: CELL * SCALES.length,
      }}
    >
      {SCALES.map((scale, row) => (
        <Group key={scale} transform={[{ translateY: row * CELL }, { scale }]}>
          <Group layer={<Paint opacity={0.8} />}>
            <DropShadow />
            <Path path={route} style="stroke" strokeWidth={4} strokeCap="round" color="#FFFFFF" />
          </Group>
          <Picture picture={text} />
          <Path path={route} style="stroke" strokeWidth={4} color="#FFFFFF">
            <BlurMask blur={6} style="normal" />
          </Path>
          <Path path={route} style="stroke" strokeWidth={2} color="#FFFFFF">
            <DashPathEffect intervals={[6, 4]} />
          </Path>
        </Group>
      ))}
      <Group clip={Skia.RRectXY(Skia.XYWHRect(CELL, 0, CELL * 3, CELL), 12, 12)}>
        <RoundedRect x={CELL} y={0} width={CELL * 3} height={CELL} r={12}>
          <LinearGradient start={vec(0, 0)} end={vec(0, CELL)} colors={['#2F2F34', '#19191C']} />
        </RoundedRect>
      </Group>
      <Rect x={CELL} y={CELL} width={CELL} height={CELL}>
        <LinearGradient
          start={vec(0, CELL)}
          end={vec(0, 2 * CELL)}
          colors={['#FFFFFF', '#C94A2E', '#141B2D']}
        />
      </Rect>
      <Rect x={2 * CELL} y={CELL} width={CELL} height={CELL}>
        <LinearGradient
          start={vec(0, CELL)}
          end={vec(0, 2 * CELL)}
          colors={['#FFFFFF', '#F6F1EA', '#C94A2E', '#141B2D', '#000000']}
        />
      </Rect>
      <Circle cx={3.5 * CELL} cy={1.5 * CELL} r={CELL / 3} color="#FFFFFF" />
      {image === null ? null : (
        <Image
          image={image}
          x={CELL}
          y={2 * CELL}
          width={CELL * 1.7}
          height={CELL * 1.3}
          fit="cover"
          sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
        />
      )}
    </Canvas>
  );
}
