# 담이 자산 선정 기록

첨부 `캐릭터 컨셉.png`를 기준으로 기존 ZIP의 자산만 선정했습니다. 새로운 비버를 생성하거나 캐릭터를 SVG/CSS로 대체하지 않았습니다. 책의 SD가 없는 기존 버전을 사용합니다.

| 공식 상태 | 정지 PNG 원본           | 현재 motion              |
| --------- | ----------------------- | ------------------------ |
| basic     | dami-original-basic.png | `motion/basic/` 4 PNG    |
| wave      | dami-original-wave.png  | `motion/wave/` 4 PNG     |
| read      | dami-original-read.png  | `motion/read/` 4 PNG     |
| happy     | dami-original-happy.png | `motion/happy/` 4 PNG    |
| carry     | dami-carry-still.png    | `motion/carry/` 5 PNG    |
| stack     | dami-original-stack.png | `motion/stack/` 4 PNG    |
| build     | dami-hammer-still.png   | `motion/build/` 5 PNG    |
| complete  | dami-cross-still.png    | `motion/complete/` 5 PNG |

공식 정지 파일은 `static/dami-{state}.png`에서 reduced-motion 및 motion 로드 실패 fallback으로 사용합니다. 일반 모션 환경에서는 `motion/`의 full-frame PNG가 사용됩니다. PNG의 RGBA·투명 배경·원본 비율을 유지합니다.

complete 상태는 책이 없는 원본 완성 포즈 대신 **동일 담이가 무지 책을 든 기존 cross 자산**을 사용해 완료 조건을 충족합니다. 다리 전체를 건너는 위치 이동은 CSS가 담당합니다.

기존 welcome GIF는 책을 든 환영 동작으로 wave 포즈와 다릅니다. 공식 wave GIF로 잘못 지정하지 않았습니다. stack 역시 일치하는 GIF가 없으며, 한 장을 반복하는 가짜 GIF를 생성하지 않았습니다.

원본 캐릭터 자료(`source/dami/`)는 2026-10-14 정리 때 프로젝트에서 빼고 사용자 백업 압축파일에 보관했습니다. 앱은 정지 fallback에 `static/`, 모든 일반 동작에 `motion/`을 사용합니다. 기존 GIF는 PNG motion이 실제 연결된 뒤 runtime 참조가 사라져 삭제했으며 제작 원본은 보존했습니다.

## Full-frame motion assets

- `motion/build/`: transparent 640×704 complete Dami poses (ready, lift, strike, impact, recover), shared bottom anchor.
- `motion/read/`: transparent 320×260 complete Dami-with-book poses (idle, page-grab, page-turn, settle). The page and hand are drawn into each complete frame; runtime does not rotate a separate page layer. Home uses a short periodic page-turn sequence from these frames.
- `motion/basic/`, `wave/`, `happy/`, `stack/`: short full-frame PNG sequences (4 frames each).
- `motion/carry/`, `complete/`: short full-frame PNG sequences (5 frames each), extracted from the preserved approved GIF source artwork.
- `Dami` resolves the selected motion sequence first. Reduced motion uses `static/`; a failed motion image switches to that state's static fallback.
- Home idle: stable pose for 7 seconds, full-frame page-grab/page-turn/settle sequence for 1.12 seconds, then stable pose; repeats after another 7 seconds. Reduced motion uses the static fallback.
- Bridge anchors Dami's feet to the nearest rendered plank top using actual SVG/image geometry. It does not rely on a fixed work-header pixel offset.
- The original artwork and source GIFs remain preserved under `source/dami/`. Runtime no longer uses GIFs; the `animated/` runtime folder was removed after PNG decode and reference checks.

## 2026-10-15 파일 형식 변경

- 모든 담이 이미지(PNG)를 **무손실 WebP**로 바꿨습니다. 픽셀 하나하나가 원본과 같은지 변환할 때 확인했고(투명 배경 포함), 용량은 약 6.6MB → 4.1MB로 줄었습니다.
- 위 표의 `PNG` 표기는 원본 형식 기록이며, 현재 파일 확장자는 `.webp`입니다.
