import {
  BridgeLandscape,
  StoryLandscape,
  StoryBridge,
  BridgeMaterials,
  DestinationBuilding,
} from './illustration/StoryWorld';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Leaf } from 'lucide-react';
import { bridgeMetrics } from '../model';
import { Dami, useReducedMotion, BUILD_TIMING_MS, type BuildFrame } from './Dami';

export function Landscape({ id = 'land' }: { id?: string }) {
  return (
    <div className="landscape" data-scene={id}>
      <StoryLandscape />
    </div>
  );
}
export function BridgeProgress({ progress, taskLabel }: { progress: number; taskLabel: string }) {
  const { percent } = bridgeMetrics(progress);
  const reduced = useReducedMotion();
  const [bridgeProgress, setBridgeProgress] = useState(percent);
  const [damiCompletion, setDamiCompletion] = useState(() => {
    const { installedLogs, segmentCount } = bridgeMetrics(percent);
    return installedLogs ? (installedLogs - 0.5) / segmentCount : 0;
  });
  const [phase, setPhaseState] = useState<
    'idle' | 'stacking' | 'approaching' | 'building' | 'installing' | 'celebrating'
  >('idle');
  const [buildFrame, setBuildFrame] = useState<BuildFrame>('ready');
  const [motionId, setMotionId] = useState(0);
  const [installingFrom, setInstallingFrom] = useState<number | null>(null);
  const [damiBottomPx, setDamiBottomPx] = useState<number | null>(null);
  const bridgeSceneRef = useRef<HTMLDivElement>(null);
  const currentPhase = useRef(phase);
  const bridgeProgressRef = useRef(bridgeProgress);
  const buildTargetProgress = useRef(percent);
  const motionSequence = useRef(0);
  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };
  const updatePhase = (next: typeof phase) => {
    currentPhase.current = next;
    setPhaseState(next);
  };

  useEffect(() => {
    const activeTarget =
      currentPhase.current === 'idle' ? bridgeProgressRef.current : buildTargetProgress.current;
    if (reduced || percent < activeTarget) {
      clearTimers();
      motionSequence.current += 1;
      bridgeProgressRef.current = percent;
      buildTargetProgress.current = percent;
      setBridgeProgress(percent);
      const { installedLogs, segmentCount } = bridgeMetrics(percent);
      setDamiCompletion(installedLogs ? (installedLogs - 0.5) / segmentCount : 0);
      setBuildFrame('ready');
      setInstallingFrom(null);
      updatePhase('idle');
      return;
    }
    if (percent <= bridgeProgressRef.current) return;
    if (currentPhase.current !== 'idle') {
      if (percent > buildTargetProgress.current) buildTargetProgress.current = percent;
      return;
    }

    const currentLogs = bridgeMetrics(bridgeProgressRef.current).installedLogs;
    const targetLogs = bridgeMetrics(percent).installedLogs;
    if (targetLogs <= currentLogs) {
      bridgeProgressRef.current = percent;
      buildTargetProgress.current = percent;
      setBridgeProgress(percent);
      return;
    }

    clearTimers();
    motionSequence.current += 1;
    const sequenceId = motionSequence.current;
    setMotionId(motionSequence.current);
    buildTargetProgress.current = percent;
    setBuildFrame('ready');
    let firstCarry = true;
    const buildNextLog = () => {
      if (motionSequence.current !== sequenceId) return;
      const before = bridgeMetrics(bridgeProgressRef.current).installedLogs;
      const target = buildTargetProgress.current;
      const targetLogs = bridgeMetrics(target).installedLogs;
      if (before >= targetLogs) {
        bridgeProgressRef.current = target;
        setBridgeProgress(target);
        setInstallingFrom(null);
        if (target >= 100) {
          setDamiCompletion(1);
          updatePhase('celebrating');
          timers.current.push(
            window.setTimeout(() => {
              if (motionSequence.current === sequenceId) updatePhase('idle');
            }, BUILD_TIMING_MS.celebrate),
          );
        } else {
          updatePhase('idle');
        }
        return;
      }

      const { segmentCount } = bridgeMetrics(target);
      setDamiCompletion(before ? (before - 0.5) / segmentCount : 0);
      updatePhase('approaching');
      const approachDelay = firstCarry ? 620 : BUILD_TIMING_MS.approach;
      firstCarry = false;
      timers.current.push(
        window.setTimeout(() => {
          if (motionSequence.current !== sequenceId) return;
          updatePhase('building');
          setBuildFrame('ready');
          timers.current.push(window.setTimeout(() => setBuildFrame('lift'), BUILD_TIMING_MS.lift));
          timers.current.push(
            window.setTimeout(() => setBuildFrame('strike'), BUILD_TIMING_MS.strike),
          );
          timers.current.push(
            window.setTimeout(() => {
              if (motionSequence.current !== sequenceId) return;
              const current = bridgeMetrics(bridgeProgressRef.current).installedLogs;
              const latestTarget = buildTargetProgress.current;
              const latestTargetLogs = bridgeMetrics(latestTarget).installedLogs;
              if (current >= latestTargetLogs) return;
              const nextLogCount = current + 1;
              const nextProgress =
                nextLogCount >= latestTargetLogs
                  ? latestTarget
                  : (nextLogCount / segmentCount) * 100;
              setInstallingFrom(current);
              bridgeProgressRef.current = nextProgress;
              setBridgeProgress(nextProgress);
              setBuildFrame('impact');
              updatePhase('installing');
            }, BUILD_TIMING_MS.impact),
          );
          timers.current.push(
            window.setTimeout(() => {
              if (motionSequence.current === sequenceId) setBuildFrame('recover');
            }, BUILD_TIMING_MS.recover),
          );
          timers.current.push(
            window.setTimeout(() => {
              if (motionSequence.current !== sequenceId) return;
              setInstallingFrom(null);
              buildNextLog();
            }, BUILD_TIMING_MS.settle),
          );
        }, approachDelay),
      );
    };
    updatePhase('stacking');
    timers.current.push(window.setTimeout(buildNextLog, BUILD_TIMING_MS.stack));
  }, [percent, reduced, phase]);

  useEffect(() => () => clearTimers(), []);

  const { installedLogs, completion } = bridgeMetrics(bridgeProgress);
  const damiState =
    phase === 'stacking'
      ? 'stack'
      : phase === 'approaching'
        ? 'carry'
        : phase === 'celebrating' || (phase === 'idle' && percent === 100)
          ? 'complete'
          : 'build';
  const bridgeStartX = 12;
  const bridgeEndX = 88;
  const damiPositionX = bridgeStartX + damiCompletion * (bridgeEndX - bridgeStartX);
  const currentBuildFootRatio: Record<BuildFrame, number> = {
    ready: 634 / 704,
    lift: 639 / 704,
    strike: 634 / 704,
    impact: 634 / 704,
    recover: 639 / 704,
  };
  const footRatio =
    phase === 'approaching'
      ? 247 / 260
      : phase === 'celebrating' || (phase === 'idle' && percent === 100)
        ? 252 / 260
        : phase === 'building' || phase === 'installing'
          ? currentBuildFootRatio[buildFrame]
          : 249 / 260;

  useLayoutEffect(() => {
    const scene = bridgeSceneRef.current;
    if (!scene) return;
    const measureDeckAnchor = () => {
      const svg = scene.querySelector<SVGSVGElement>('.story-bridge');
      const bridge = scene.closest<HTMLElement>('.bridge');
      const safeArea = bridge?.querySelector<HTMLElement>('.bridge-dami-safe-area');
      const dami = safeArea?.querySelector<HTMLElement>('.bridge-dami');
      if (!svg || !dami || !safeArea) return;
      const svgRect = svg.getBoundingClientRect();
      const damiRect = dami.getBoundingClientRect();
      const scale = Math.min(svgRect.width / 1500, svgRect.height / 132);
      if (!scale || !damiRect.height) return;
      const damiCenterX = damiRect.left + damiRect.width / 2;
      const installedLogs = Array.from(
        scene.querySelectorAll<SVGGElement>('.log.installed:not(.installing)'),
      );
      const nearestLog = installedLogs
        .map((log) => {
          const plank = log.querySelector<SVGPathElement>('path[fill]');
          const rect = plank?.getBoundingClientRect();
          return rect
            ? { rect, distance: Math.abs(rect.left + rect.width / 2 - damiCenterX) }
            : null;
        })
        .filter((entry): entry is { rect: DOMRect; distance: number } => entry !== null)
        .sort((a, b) => a.distance - b.distance)[0];
      const deckTop = nearestLog?.rect.top ?? svgRect.bottom - 58.25 * scale;
      // Keep the tallest full-frame pose's opaque head pixels inside the Bridge safe area.
      const nextBottom = Math.max(
        0,
        safeArea.getBoundingClientRect().bottom - deckTop - (1 - footRatio) * damiRect.height - 1.5,
      );
      setDamiBottomPx((current) =>
        current !== null && Math.abs(current - nextBottom) < 0.25 ? current : nextBottom,
      );
    };
    measureDeckAnchor();
    const observer = new ResizeObserver(measureDeckAnchor);
    observer.observe(scene);
    const bridge = scene.closest<HTMLElement>('.bridge');
    const safeArea = bridge?.querySelector<HTMLElement>('.bridge-dami-safe-area');
    const dami = safeArea?.querySelector<HTMLElement>('.bridge-dami');
    if (dami) observer.observe(dami);
    if (safeArea) observer.observe(safeArea);
    window.addEventListener('resize', measureDeckAnchor);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureDeckAnchor);
    };
  }, [bridgeProgress, damiPositionX, footRatio, phase, buildFrame, percent]);

  return (
    <section
      className={`bridge bridge-phase-${phase}`}
      aria-label={`${taskLabel} 진행률 ${percent}%, 설치된 통나무 ${installedLogs}개`}
      data-progress={percent}
      data-bridge-progress={bridgeProgress}
      data-installed-logs={installedLogs}
      data-completion={completion}
      data-phase={phase}
    >
      <div className="bridge-title">
        <span>
          <Leaf size={16} /> {taskLabel} · 진행 현황
        </span>
        <strong>{percent}%</strong>
      </div>
      <div className="bridge-scene" ref={bridgeSceneRef}>
        <BridgeLandscape />
        <BridgeMaterials />
        <StoryBridge
          progress={bridgeProgress}
          installingFrom={phase === 'installing' ? installingFrom : null}
        />
        <DestinationBuilding />
      </div>
      <div className="bridge-dami-safe-area" aria-hidden="true" data-safe-area="bridge-dami">
        <div
          className="bridge-dami"
          data-bridge-position={damiCompletion}
          data-character-state={phase}
          data-frame-canvas={phase === 'building' || phase === 'installing' ? 'build' : undefined}
          style={{
            left: `${damiPositionX}%`,
            height: phase === 'building' || phase === 'installing' ? 'auto' : undefined,
            bottom: damiBottomPx === null ? undefined : `${damiBottomPx}px`,
            aspectRatio: phase === 'building' || phase === 'installing' ? '640 / 704' : '320 / 260',
          }}
        >
          <Dami
            key={motionId}
            state={damiState}
            animated={phase !== 'idle'}
            buildFrame={buildFrame}
          />
        </div>
      </div>
      <span className="sr-only" role="status">
        {`${percent}% 완료, 통나무 ${installedLogs}개 설치`}
      </span>
    </section>
  );
}
