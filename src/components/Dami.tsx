import { useEffect, useState, type CSSProperties } from 'react';

const assets = import.meta.glob('../assets/dami/static/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const motionAssets = import.meta.glob('../assets/dami/motion/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const buildFrameAssets = import.meta.glob('../assets/dami/motion/build/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
export type BuildFrame = 'ready' | 'lift' | 'strike' | 'impact' | 'recover';
type ReadFrame = 'idle' | 'page-grab' | 'page-turn' | 'settle';
const readFrameAssets = import.meta.glob('../assets/dami/motion/read/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const READ_FRAMES: ReadFrame[] = ['idle', 'page-grab', 'page-turn', 'settle'];
const readFrameSrc = (frame: ReadFrame) =>
  readFrameAssets['../assets/dami/motion/read/' + frame + '.webp'];
type DamiState = 'basic' | 'wave' | 'read' | 'happy' | 'carry' | 'stack' | 'build' | 'complete';
// Visible painted height at a common display box, with basic as the reference.
// These are uniform scales: character proportions and the approved frames stay intact.
const DAMI_VISUAL_SCALE: Record<DamiState, number> = {
  basic: 1,
  wave: 1.09,
  read: 1.18,
  happy: 1.18,
  carry: 1.1,
  stack: 1.3,
  build: 1.18,
  complete: 1.1,
};
const DAMI_HOME_SCALE: Record<DamiState, number> = {
  ...DAMI_VISUAL_SCALE,
  read: 1.24,
};
const HOME_MOTIONS: DamiState[] = ['wave', 'read', 'happy'];
const DAMI_MOTION_FRAMES: Record<DamiState, string[]> = {
  basic: ['00.webp', '01.webp', '02.webp', '03.webp'],
  wave: ['00.webp', '01.webp', '02.webp', '03.webp'],
  read: READ_FRAMES.map((frame) => frame + '.webp'),
  happy: ['00.webp', '01.webp', '02.webp', '03.webp'],
  carry: ['00.webp', '01.webp', '02.webp', '03.webp', '04.webp'],
  stack: ['00.webp', '01.webp', '02.webp', '03.webp'],
  build: ['ready.webp', 'lift.webp', 'strike.webp', 'impact.webp', 'recover.webp'],
  complete: ['00.webp', '01.webp', '02.webp', '03.webp', '04.webp'],
};
const motionFrameSrc = (state: DamiState, frame: string) =>
  motionAssets[`../assets/dami/motion/${state}/${frame}`];
const motionFrames = (state: DamiState) =>
  DAMI_MOTION_FRAMES[state].map((frame) => motionFrameSrc(state, frame));
for (const src of READ_FRAMES.map(readFrameSrc)) {
  if (src) {
    const image = new Image();
    image.src = src;
  }
}
const BUILD_FRAMES: BuildFrame[] = ['ready', 'lift', 'strike', 'impact', 'recover'];
export const BUILD_TIMING_MS = {
  approach: 180,
  lift: 50,
  strike: 110,
  impact: 180,
  recover: 260,
  settle: 300,
  celebrate: 1900,
  stack: 1300,
} as const;
const buildFrameSrc = (frame: BuildFrame) =>
  buildFrameAssets[`../assets/dami/motion/build/${frame}.webp`];
for (const src of BUILD_FRAMES.map(buildFrameSrc)) {
  if (src) {
    const image = new Image();
    image.src = src;
  }
}
export function useReducedMotion() {
  const [value, set] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => set(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);
  return value;
}
export function Dami({
  state = 'basic',
  animated = true,
  homeIdle = false,
  className = '',
  buildFrame = 'ready',
}: {
  state?: DamiState;
  animated?: boolean;
  homeIdle?: boolean;
  className?: string;
  buildFrame?: BuildFrame;
}) {
  const reduced = useReducedMotion();
  const [readFrame, setReadFrame] = useState<ReadFrame>('idle');
  const [homeMotionState, setHomeMotionState] = useState<DamiState | null>(null);
  const [homeMotionFrameIndex, setHomeMotionFrameIndex] = useState(0);
  const [motionFrameIndex, setMotionFrameIndex] = useState(0);
  const [failedMotionState, setFailedMotionState] = useState<DamiState | null>(null);
  const stateMotionFrames = motionFrames(state);
  const hasStateMotion = stateMotionFrames.length > 0 && stateMotionFrames.every(Boolean);
  useEffect(() => {
    setHomeMotionState(null);
    setHomeMotionFrameIndex(0);
    if (
      !homeIdle ||
      reduced ||
      !HOME_MOTIONS.every((motion) => motionFrames(motion).every(Boolean))
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let previousMotion: DamiState | null = null;
    let frame = 0;
    const frameDelay = 320;
    const idleDelay = 1500;
    const chooseMotion = () => {
      if (cancelled) return;
      const choices = HOME_MOTIONS.filter((motion) => motion !== previousMotion);
      const nextMotion = choices[Math.floor(Math.random() * choices.length)];
      previousMotion = nextMotion;
      frame = 0;
      setHomeMotionState(nextMotion);
      setHomeMotionFrameIndex(0);
      timer = setTimeout(advance, frameDelay);
    };
    const advance = () => {
      if (cancelled || !previousMotion) return;
      const frames = motionFrames(previousMotion);
      frame += 1;
      if (frame >= frames.length * 2) {
        setHomeMotionState(null);
        setHomeMotionFrameIndex(0);
        timer = setTimeout(chooseMotion, idleDelay);
        return;
      }
      setHomeMotionFrameIndex(frame % frames.length);
      timer = setTimeout(advance, frameDelay);
    };
    timer = setTimeout(chooseMotion, idleDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [homeIdle, reduced]);
  useEffect(() => {
    if (state !== 'read' || reduced || !READ_FRAMES.every((frame) => readFrameSrc(frame))) {
      setReadFrame('idle');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const sequence: Array<[ReadFrame, number]> = [
      ['page-grab', 260],
      ['page-turn', 520],
      ['settle', 840],
      ['idle', 1120],
    ];
    let index = 0;
    const advance = () => {
      if (cancelled) return;
      if (index === sequence.length) index = 0;
      const [frame, delay] = sequence[index++];
      setReadFrame(frame);
      timer = setTimeout(advance, delay);
    };
    setReadFrame('idle');
    timer = setTimeout(advance, 240);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, reduced]);
  useEffect(() => {
    setMotionFrameIndex(0);
    setFailedMotionState(null);
    if (
      !animated ||
      reduced ||
      homeIdle ||
      state === 'read' ||
      state === 'build' ||
      !hasStateMotion
    ) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const isOneShot = state === 'complete';
    const duration =
      state === 'basic'
        ? [1350, 150, 220, 900]
        : state === 'wave'
          ? [180, 180, 180, 720]
          : state === 'happy'
            ? [240, 280, 300, 920]
            : state === 'stack'
              ? [130, 150, 150, 150]
              : state === 'complete'
                ? [250, 270, 310, 280, 520]
                : [140, 170, 170, 170, 220];
    let frame = 0;
    const advance = () => {
      if (cancelled) return;
      setMotionFrameIndex(frame);
      const delay = duration[frame] ?? 180;
      frame += 1;
      if (frame >= duration.length) {
        if (isOneShot) return;
        frame = 0;
      }
      timer = setTimeout(advance, delay);
    };
    timer = setTimeout(advance, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [animated, hasStateMotion, homeIdle, reduced, state]);
  const isFullFrameBuild =
    state === 'build' && !reduced && failedMotionState !== state && !!buildFrameSrc(buildFrame);
  const isFullFrameRead =
    state === 'read' && !reduced && failedMotionState !== state && !!readFrameSrc(readFrame);
  const homeMotionFrames = homeMotionState ? motionFrames(homeMotionState) : [];
  const homeMotionFrame =
    homeMotionState && homeMotionFrames.every(Boolean) && !reduced
      ? homeMotionFrames[homeMotionFrameIndex]
      : undefined;
  const isHomeIdleMotion = !!homeMotionFrame && failedMotionState !== state;
  const homeStableMotionSrc =
    homeIdle && !reduced && failedMotionState !== state
      ? motionFrameSrc('basic', '00.webp')
      : undefined;
  const stateMotionIndex =
    !animated && state === 'complete' ? stateMotionFrames.length - 1 : motionFrameIndex;
  const stateMotionSrc = hasStateMotion ? stateMotionFrames[stateMotionIndex] : undefined;
  const useStateMotion =
    !reduced &&
    !homeIdle &&
    state !== 'read' &&
    state !== 'build' &&
    !!stateMotionSrc &&
    failedMotionState !== state;
  const source = isHomeIdleMotion
    ? homeMotionFrame
    : homeStableMotionSrc
      ? homeStableMotionSrc
      : isFullFrameBuild
        ? buildFrameSrc(buildFrame)
        : isFullFrameRead
          ? readFrameSrc(readFrame)
          : useStateMotion
            ? stateMotionSrc
            : assets['../assets/dami/static/dami-' + state + '.webp'];
  return (
    <img
      className={'dami ' + className}
      data-dami-state={homeMotionState ?? state}
      style={
        {
          '--dami-visual-scale': DAMI_VISUAL_SCALE[state],
          '--dami-home-scale': DAMI_HOME_SCALE[homeMotionState ?? state],
        } as CSSProperties
      }
      src={source}
      data-animation-frame={
        isHomeIdleMotion
          ? `${homeMotionState}-${DAMI_MOTION_FRAMES[homeMotionState!][homeMotionFrameIndex].replace('.webp', '')}`
          : homeIdle
            ? 'idle'
            : isFullFrameBuild
              ? buildFrame
              : isFullFrameRead
                ? readFrame
                : useStateMotion
                  ? DAMI_MOTION_FRAMES[state][motionFrameIndex]
                  : undefined
      }
      alt={
        '담이 · ' +
        {
          basic: '안내',
          wave: '인사',
          read: '읽기',
          happy: '기쁨',
          carry: '나무 운반',
          stack: '나무 쌓기',
          build: '다리 만들기',
          complete: '완성',
        }[state]
      }
      draggable={false}
      onError={() => {
        if (useStateMotion || isFullFrameBuild || isFullFrameRead || isHomeIdleMotion) {
          setFailedMotionState(state);
        }
      }}
    />
  );
}
