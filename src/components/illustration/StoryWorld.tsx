import { useId, type CSSProperties } from 'react';
import { bridgeMetrics } from '../../model';

// Shared scene artwork. Dami is a separate transparent image layer above the bridge.
const WORLD_COLORS = {
  outline: '#715035',
  wood: '#C47A3A',
  woodLight: '#DEAB70',
  woodShadow: '#9B6439',
  water: '#98D8DF',
  waterShadow: '#70BAC6',
  ripple: '#DFF5EE',
  grass: '#AFC980',
  grassShadow: '#7FAD79',
  leaf: '#679E83',
  leafDark: '#417D6F',
  mint: '#F2F8F7',
};

function Tree({
  x,
  y,
  scale = 1,
  pine = false,
}: {
  x: number;
  y: number;
  scale?: number;
  pine?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-5 0 -3-80 6-80 8 0" fill="#956642" stroke="#765239" strokeWidth="2.5" />
      {pine ? (
        <>
          <path
            d="M0-162C-15-162-20-148-16-138C-34-132-36-116-24-107C-41-96-36-79-20-74C-34-58-28-43-14-40C-7-29 8-31 14-38C30-30 43-42 36-56C51-65 44-81 31-87C42-103 31-117 17-120C25-139 15-154 0-154Z"
            fill="#528D74"
          />
          <path
            d="M-2-151C-10-151-16-142-10-134C-26-130-29-116-16-108C-32-99-28-84-14-79C-25-64-19-48-6-45C2-37 12-40 16-47C29-39 39-50 31-61C43-70 37-82 25-88C34-100 25-112 12-116C20-134 11-147-2-151Z"
            fill="#75AA82"
          />
        </>
      ) : (
        <>
          <path
            d="M-10-132C-31-134-40-119-38-104C-60-99-61-78-50-65C-58-46-42-31-23-35C-12-18 8-22 18-32C41-23 54-39 48-56C65-69 56-91 42-96C44-116 27-129 10-124Q2-138-10-132Z"
            fill="#629B7F"
          />
          <path
            d="M-11-128C-26-129-36-117-31-104C-49-100-54-86-43-76Q-32-88-17-77C-8-92 10-81 15-73C36-67 49-82 40-94C39-111 24-120 10-114Q7-132-11-128Z"
            fill="#89B693"
          />
        </>
      )}
    </g>
  );
}
function Grass({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M0 0C-32-8-34-37-26-35C-13-31-4-8 0 0C-6-30 1-58 10-48C17-36 5-9 0 0C16-33 35-32 29-23C21-12 10-3 0 0Z"
        fill="#65935E"
      />
      <path
        d="M1 1C-20-12-17-23-12-21C-5-18 0-6 1 1C7-24 16-35 21-29C22-20 10-3 1 1Z"
        fill="#B5CB78"
      />
    </g>
  );
}
function Rock({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M-27 1Q-25-17-10-22Q7-28 19-15L31 0Q26 8-4 8Q-24 8-27 1Z"
        fill="#AFAE94"
        stroke="#898975"
        strokeWidth="2"
      />
      <path d="M-23-2Q-19-19-5-20Q5-21 10-14L3-5Z" fill="#D7D1AF" />
    </g>
  );
}
function Cloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M-68 5Q-76-15-52-19Q-51-43-28-42Q-18-64 5-46Q25-58 39-32Q67-36 72-11Q94 9 66 13H-48Q-62 14-68 5Z"
      fill="#fff"
      opacity=".7"
    />
  );
}
function StoryRiver({ compact = false }: { compact?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <>
      <defs>
        <linearGradient id={`water-${id}`} x2="0" y2="1">
          <stop stopColor={WORLD_COLORS.water} />
          <stop offset="1" stopColor={WORLD_COLORS.waterShadow} />
        </linearGradient>
      </defs>
      <path
        d={
          compact
            ? 'M0 113Q300 97 700 113T1440 105V230H0Z'
            : 'M0 472Q350 438 720 470T1440 452V800H0Z'
        }
        fill={`url(#water-${id})`}
      />
      {Array.from({ length: compact ? 16 : 23 }, (_, i) => {
        const x = 100 + ((i * 173) % 1280);
        const y = compact ? 137 + ((i * 23) % 77) : 498 + ((i * 37) % 270);
        return (
          <g key={i}>
            <path
              d={`M${x} ${y}q${20 + (i % 4) * 5} -3 ${48 + (i % 3) * 12} 0`}
              stroke={WORLD_COLORS.ripple}
              strokeWidth={compact ? 3 : 5}
              strokeLinecap="round"
              fill="none"
              opacity=".8"
            />
            {i % 3 === 0 && (
              <ellipse cx={x + 32} cy={y + 8} rx="26" ry="3" fill="#63A9B9" opacity=".35" />
            )}
          </g>
        );
      })}
    </>
  );
}
function RiverBank({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <>
      <path
        d="M0 115Q85 112 126 141L112 165Q131 181 141 230H0ZM1440 114Q1351 109 1314 144L1330 168Q1316 195 1310 230H1440Z"
        fill="#85AC76"
      />
      <path
        d="M0 115Q76 105 126 141L112 153Q61 137 0 157ZM1440 115Q1358 101 1314 144L1330 155Q1398 139 1440 153Z"
        fill="#BCD391"
      />
      <Rock x={80} y={179} scale={0.8} />
      <Rock x={1360} y={189} scale={0.7} />
      <Grass x={34} y={196} scale={0.8} />
      <Grass x={1400} y={174} scale={0.65} />
    </>
  ) : (
    <>
      <path
        d="M0 447Q141 431 287 514Q347 550 428 563Q501 589 438 638Q590 658 748 800H0ZM1440 445Q1330 434 1271 486Q1191 548 1304 571Q1349 588 1282 644L1350 706 1440 716Z"
        fill="#88AF7D"
      />
      <path
        d="M0 447Q156 446 278 511Q326 544 431 566Q487 587 438 613Q300 582 218 589Q129 602 0 571ZM1440 445Q1340 433 1271 486L1241 521Q1344 502 1440 539Z"
        fill="#C0D493"
      />
      <path
        d="M0 623Q112 586 230 628Q415 651 488 695L569 743Q375 709 270 738Q132 779 0 744Z"
        fill="#ACC780"
      />
      <Rock x={380} y={645} scale={1.3} />
      <Rock x={1310} y={549} scale={1} />
      <Rock x={92} y={537} scale={0.9} />
      <Rock x={622} y={774} scale={1.45} />
      <Grass x={54} y={706} scale={1.6} />
      <Grass x={329} y={622} scale={1.1} />
      <Grass x={1332} y={522} scale={1.1} />
      <Grass x={1364} y={705} scale={1.5} />
      <Grass x={470} y={749} scale={1.3} />
      <Grass x={182} y={790} scale={1.7} />
      <g fill="#F5E6D3">
        <circle cx="110" cy="662" r="5" />
        <circle cx="129" cy="672" r="4" />
        <circle cx="363" cy="740" r="5" />
      </g>
    </>
  );
}
function BridgeLog({
  index,
  installed,
  installing = false,
}: {
  index: number;
  installed: boolean;
  installing?: boolean;
}) {
  return (
    <g
      className={`log ${installed ? 'installed' : ''} ${installing ? 'installing' : ''}`}
      data-installed={installed}
      data-installing={installing}
      style={{ '--install-delay': `${Math.min(index, 18) * 18}ms` } as CSSProperties}
      transform={`translate(${index * 75} 0) scale(1.36 1)`}
    >
      {installed ? (
        <>
          <path
            d={`M1 ${index % 2 ? 79 : 80}Q0 75 7 75H53Q55 76 54 82V96H1Z`}
            fill={WORLD_COLORS.wood}
            stroke={WORLD_COLORS.outline}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d={`M6 ${index % 2 ? 79 : 80}H49M9 ${index % 3 ? 86 : 88}H${index % 2 ? 37 : 43}`}
            stroke={WORLD_COLORS.woodLight}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M6 92H47"
            stroke={WORLD_COLORS.woodShadow}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {index % 5 === 2 && (
            <g fill="none" stroke={WORLD_COLORS.woodShadow} strokeWidth="1.4" opacity=".86">
              <ellipse cx="36" cy="86" rx="4" ry="2.4" />
              <ellipse cx="36" cy="86" rx="1.5" ry="1" />
            </g>
          )}
          {index % 4 === 0 && (
            <>
              <rect
                x="4"
                y="91"
                width="12"
                height="35"
                rx="4"
                fill={WORLD_COLORS.wood}
                stroke={WORLD_COLORS.outline}
                strokeWidth="2.5"
              />
              <ellipse
                cx="10.5"
                cy="93"
                rx="6"
                ry="3"
                fill={WORLD_COLORS.woodLight}
                stroke={WORLD_COLORS.outline}
                strokeWidth="2"
              />
              <path
                d="M8 99V121"
                stroke={WORLD_COLORS.woodLight}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          )}
        </>
      ) : (
        <path d="M6 95H47" stroke="#72A9AC" strokeWidth="2" strokeDasharray="3 5" opacity=".6" />
      )}
    </g>
  );
}
export function StoryBridge({
  progress = 100,
  installingFrom = null,
}: {
  progress?: number;
  installingFrom?: number | null;
}) {
  const { installedLogs: logs } = bridgeMetrics(progress);
  const deckWidth = logs * 75;
  return (
    <svg
      className="story-bridge"
      viewBox="0 0 1500 132"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
    >
      {logs > 0 && (
        <>
          <rect
            x="0"
            y="87"
            width={deckWidth}
            height="15"
            rx="5"
            fill={WORLD_COLORS.outline}
            opacity=".9"
          />
          <rect
            x="2"
            y="84"
            width={Math.max(0, deckWidth - 4)}
            height="13"
            rx="5"
            fill={WORLD_COLORS.woodShadow}
          />
          <path d={`M0 102H${deckWidth}`} stroke="#6E4B32" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {Array.from({ length: 20 }, (_, i) => (
        <BridgeLog
          key={i}
          index={i}
          installed={i < logs}
          installing={installingFrom !== null && i >= installingFrom && i < logs}
        />
      ))}
    </svg>
  );
}

/** Storybook-style supply stack, built from the same log colors and outlines as StoryBridge. */
export function BridgeMaterials() {
  return (
    <svg className="bridge-materials" viewBox="0 0 112 62" aria-hidden="true">
      <g stroke={WORLD_COLORS.outline} strokeWidth="2.1" strokeLinejoin="round">
        <g>
          <rect x="13" y="39" width="88" height="13" rx="6.5" fill={WORLD_COLORS.woodShadow} />
          <ellipse cx="16" cy="45.5" rx="6.4" ry="6.5" fill={WORLD_COLORS.woodLight} />
          <ellipse
            cx="16"
            cy="45.5"
            rx="2.7"
            ry="3"
            fill="none"
            stroke={WORLD_COLORS.woodShadow}
            strokeWidth="1.3"
          />
          <ellipse cx="98" cy="45.5" rx="6.4" ry="6.5" fill={WORLD_COLORS.wood} />
          <path d="M25 42h65" stroke="#E7B77E" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g>
          <rect x="8" y="26" width="84" height="13" rx="6.5" fill={WORLD_COLORS.wood} />
          <ellipse cx="11" cy="32.5" rx="6.4" ry="6.5" fill={WORLD_COLORS.woodLight} />
          <ellipse
            cx="11"
            cy="32.5"
            rx="2.7"
            ry="3"
            fill="none"
            stroke={WORLD_COLORS.woodShadow}
            strokeWidth="1.3"
          />
          <ellipse cx="89" cy="32.5" rx="6.4" ry="6.5" fill={WORLD_COLORS.woodShadow} />
          <path d="M20 29h59" stroke="#E7B77E" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g>
          <rect x="24" y="13" width="71" height="13" rx="6.5" fill={WORLD_COLORS.wood} />
          <ellipse cx="27" cy="19.5" rx="6.4" ry="6.5" fill={WORLD_COLORS.woodLight} />
          <ellipse
            cx="27"
            cy="19.5"
            rx="2.7"
            ry="3"
            fill="none"
            stroke={WORLD_COLORS.woodShadow}
            strokeWidth="1.3"
          />
          <ellipse cx="92" cy="19.5" rx="6.4" ry="6.5" fill={WORLD_COLORS.woodShadow} />
          <path d="M36 16h46" stroke="#E7B77E" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/** A small company office landmark in the same warm illustrated world. */
export function DestinationBuilding() {
  return (
    <svg className="destination-building" viewBox="0 0 120 94" aria-hidden="true">
      <path
        d="M13 27 21 18h78l8 9v5H13Z"
        fill="#C47A3A"
        stroke={WORLD_COLORS.outline}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="M18 32h86v54H18Z"
        fill="#F5E6D3"
        stroke={WORLD_COLORS.outline}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path d="M18 48h86M18 65h86" stroke="#C6A47D" strokeWidth="1.6" />
      <rect
        x="40"
        y="5"
        width="44"
        height="17"
        rx="5"
        fill="#287271"
        stroke={WORLD_COLORS.outline}
        strokeWidth="2"
      />
      <text
        x="62"
        y="17"
        fill="#F2F8F7"
        fontFamily="sans-serif"
        fontSize="9"
        fontWeight="700"
        textAnchor="middle"
      >
        회사
      </text>
      <g fill="#A9D9D8" stroke={WORLD_COLORS.outline} strokeWidth="1.8">
        <rect x="25" y="36" width="13" height="9" rx="1.5" />
        <rect x="47" y="36" width="13" height="9" rx="1.5" />
        <rect x="69" y="36" width="13" height="9" rx="1.5" />
        <rect x="88" y="36" width="10" height="9" rx="1.5" />
        <rect x="25" y="53" width="13" height="9" rx="1.5" />
        <rect x="47" y="53" width="13" height="9" rx="1.5" />
        <rect x="69" y="53" width="13" height="9" rx="1.5" />
        <rect x="88" y="53" width="10" height="9" rx="1.5" />
      </g>
      <path d="M51 68h19v18H51Z" fill="#287271" stroke={WORLD_COLORS.outline} strokeWidth="2.3" />
      <circle cx="65" cy="78" r="1" fill="#F5E6D3" />
      <path d="M8 88h104" stroke="#80A96C" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function BridgeLandscape() {
  return (
    <div className="bridge-landscape" aria-hidden="true">
      <svg className="bridge-water-art" viewBox="0 0 1920 146" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bridgeWater" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#BFE4E2" />
            <stop offset=".36" stopColor="#91D2D8" />
            <stop offset="1" stopColor="#78BCC9" />
          </linearGradient>
        </defs>
        <rect width="1920" height="146" fill="#EAF6F1" />
        <Cloud x={360} y={33} scale={0.48} />
        <Cloud x={1120} y={20} scale={0.34} />
        <Cloud x={1640} y={39} scale={0.42} />
        <path
          d="M0 58Q135 37 258 54T520 52T800 56T1080 48T1360 54T1640 45T1920 52V93H0Z"
          fill="#BED9C4"
        />
        <path
          d="M0 70Q160 56 320 67T640 63T960 68T1280 60T1600 67T1920 58V146H0Z"
          fill="url(#bridgeWater)"
        />
        <path
          d="M0 68Q108 55 213 75L263 122Q196 138 138 146H0ZM1920 59Q1812 56 1707 75L1657 122Q1724 138 1782 146H1920Z"
          fill="#87AD78"
        />
        <path
          d="M0 68Q108 55 213 75L233 90Q122 77 0 88ZM1920 59Q1812 56 1707 75L1687 90Q1798 76 1920 83Z"
          fill="#C0D493"
        />
        <path
          d="M0 103Q240 97 480 104T960 101T1440 103T1920 98"
          fill="none"
          stroke="#DDF3E9"
          strokeWidth="3"
          opacity=".82"
        />
        <path
          d="M0 130Q260 124 520 131T1040 128T1560 130T1920 126"
          fill="none"
          stroke="#6EB1C0"
          strokeWidth="2.5"
          opacity=".55"
        />
      </svg>
      <div className="bridge-tree grove-one">
        <svg viewBox="-70 -170 140 180">
          <Tree x={0} y={0} scale={0.9} />
        </svg>
      </div>
      <div className="bridge-tree grove-two">
        <svg viewBox="-70 -170 140 180">
          <Tree x={0} y={0} scale={0.7} pine />
        </svg>
      </div>
      <div className="bridge-tree grove-three">
        <svg viewBox="-70 -170 140 180">
          <Tree x={0} y={0} scale={0.72} />
        </svg>
      </div>
      <div className="bridge-tree grove-four">
        <svg viewBox="-70 -170 140 180">
          <Tree x={0} y={0} scale={0.85} pine />
        </svg>
      </div>
      <div className="bridge-stone left-stone">
        <svg viewBox="-34 -30 68 40">
          <Rock x={0} y={0} />
        </svg>
      </div>
      <div className="bridge-stone right-stone">
        <svg viewBox="-34 -30 68 40">
          <Rock x={0} y={0} />
        </svg>
      </div>
    </div>
  );
}
export function StoryLandscape({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`story-landscape ${compact ? 'compact' : 'wide'}`} aria-hidden="true">
      <svg
        className="world-scenery"
        viewBox={compact ? '0 0 1440 230' : '0 0 1440 800'}
        preserveAspectRatio={compact ? 'none' : 'xMidYMax slice'}
      >
        <rect width="1440" height={compact ? 230 : 800} fill="#F2F8F7" />
        {!compact && (
          <>
            <Cloud x={1080} y={271} scale={1.3} />
            <Cloud x={150} y={291} scale={1} />
            <path
              d="M0 432C105 338 161 340 253 388S393 322 490 366S643 351 736 396S910 310 1014 365S1197 279 1290 331S1380 347 1440 366V530H0Z"
              fill="#BBDEE0"
            />
            <path
              d="M0 463C110 389 170 408 277 445S444 387 538 423S692 424 777 438S900 390 995 423S1149 351 1230 410S1360 385 1440 418V543H0Z"
              fill="#A9CFC6"
            />
          </>
        )}
        {compact ? (
          <>
            <path
              d="M0 111Q137 49 268 98Q406 43 534 102Q658 59 777 93Q949 42 1090 99Q1266 48 1440 89V160H0Z"
              fill="#C8DFCC"
            />
            {Array.from({ length: 22 }, (_, i) => (
              <Tree key={i} x={i * 70} y={135} scale={0.3 + (i % 3) * 0.09} pine={i % 5 === 0} />
            ))}
          </>
        ) : (
          <>
            {[50, 210, 360, 405, 1055, 1112, 1230, 1410].map((x, i) => (
              <Tree
                key={x}
                x={x}
                y={475 + (i % 3) * 15}
                scale={0.9 + (i % 3) * 0.25}
                pine={i % 3 === 0}
              />
            ))}
            {[374, 440, 535, 916, 1010, 1090].map((x, i) => (
              <Tree key={x} x={x} y={487} scale={0.45 + (i % 2) * 0.1} />
            ))}
          </>
        )}
        <StoryRiver compact={compact} />
        <RiverBank compact={compact} />
      </svg>
      {!compact && <StoryBridge />}
    </div>
  );
}
