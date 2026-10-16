import { Canvas, Group } from '@shopify/react-native-skia';

import { CANVAS_FORMATS } from '@/core/template';

import { TemplateScene, type TemplateSceneProps } from './template-scene';

interface EditorCanvasProps extends TemplateSceneProps {
  /** On-screen width; the height follows the template format. */
  readonly displayWidth: number;
}

/** The template scene scaled down from its 1080 px export size to the screen. */
export function EditorCanvas({ displayWidth, ...scene }: EditorCanvasProps) {
  const { width, height } = CANVAS_FORMATS[scene.template.format];
  const ratio = displayWidth / width;
  return (
    <Canvas style={{ width: displayWidth, height: height * ratio }}>
      <Group transform={[{ scale: ratio }]}>
        <TemplateScene {...scene} />
      </Group>
    </Canvas>
  );
}
