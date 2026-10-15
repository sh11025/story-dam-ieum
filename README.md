<div align="center">

<img src="public/favicon.svg" width="72" alt="" />

# 스토리 담 이음 · Story Dam Ieum

**지금까지의 경험을, 다음 기회로 이어 주는 다리**<br />
담이와 함께 채용공고를 읽고, 자기소개서·이력서·면접을 한곳에서 준비하는 웹사이트예요.

### [👉 사이트 바로가기 — story-dam-ieum.onrender.com](https://story-dam-ieum.onrender.com/)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Render](https://img.shields.io/badge/배포-Render-46E3B7?logo=render&logoColor=white)
![Tests](https://img.shields.io/badge/자동_테스트-57개_통과-2E7D6B)

<img src="docs/images/01-start.png" width="860" alt="스토리 담 이음 첫 화면: 담이가 책을 읽고 있고, 오른쪽에 체험 시작하기 버튼" />

</div>

> [!NOTE]
> 무료 서버를 쓰고 있어서, 한동안 아무도 들어오지 않았다면 **첫 접속이 1분 정도** 걸릴 수 있어요. 화면에 "서버를 깨우고 있어요"가 보이면 잠시만 기다려 주세요.

<br />

## ✨ 이런 걸 할 수 있어요

| | 기능 | 설명 |
| :-: | --- | --- |
| 📌 | **공고 가져오기** | 채용공고를 붙여넣거나 **주소만 넣으면** 회사명·직무·주요 업무·자격요건·우대사항·마감일을 찾아 채워요. 사람인·잡코리아·원티드 실제 공고로 확인했어요. |
| ✍️ | **자기소개서** | 쓰는 화면 바로 옆에서 '내 경험'을 정리하고, **본문에 넣기**로 바로 옮겨요. 문항별 글자 수(공백 포함·제외·바이트)를 세어 줘요. |
| 🔗 | **이력서 자동 연결** | 자기소개서에 정리한 경험이 이력서 '프로젝트·활동/경력'에 **저절로** 들어가요. 한쪽에서 고치면 다른 쪽도 함께 바뀌어요. |
| 🎤 | **면접 연습** | 공고를 바탕으로 기본 질문 5개에 답하고, 정리한 경험을 옆에 띄워 놓고 연습해요. |
| 📄 | **내보내기** | 워드(DOCX)·PDF로 저장하고, 작업 전체는 `.sdi` 파일로 보관·불러오기 해요. |
| 🗂️ | **지원서 여러 개** | 회사별로 지원서를 따로 만들고 마감일 D-day를 보여 줘요. |
| 🔒 | **내 기기에만 저장** | 작성한 글은 **서버에 저장하지 않아요.** 브라우저와 내가 내려받은 파일에만 남아요. |

<br />

## 🧭 이렇게 이어져요

자기소개서와 면접 준비는 **지원할 공고부터** 시작해요. 이력서는 공고 없이 바로 만들 수 있어요.

```mermaid
flowchart LR
    start(["🏠 홈"]) --> app["📌 지원 정보<br/>공고 붙여넣기 · 주소로 가져오기"]
    start --> resume["📄 이력서"]

    app -->|자기소개서| cover["✍️ 자기소개서 쓰기<br/>+ 옆에서 내 경험 정리"]
    cover --> review["✅ 최종 점검<br/>워드 · PDF 저장"]
    app -->|면접 준비| interview["🎤 면접 연습"]

    cover <-.->|"경험 ↔ 이력서<br/>자동 연결"| resume
    cover -.->|정리한 경험 참고| interview

    classDef main fill:#e6f3f6,stroke:#2f7488,color:#18323a
    classDef sync fill:#fff6e8,stroke:#b48d50,color:#3b2f1c
    class app,cover,review,interview main
    class resume sync
```

<br />

## 🖼️ 화면 둘러보기

### 1. 홈 — 오늘 준비할 일 고르기
자기소개서·이력서·면접 준비를 고르고, 회사별 지원서를 관리해요.

<img src="docs/images/02-home.png" width="860" alt="홈 화면: 자기소개서 작성, 이력서 작성, 면접 준비, 저장한 작업 불러오기 카드와 내 지원서 목록" />

### 2. 지원 정보 — 공고에서 항목 찾기
공고 글을 붙여넣거나 채용 사이트 주소를 넣으면, 적혀 있는 항목만 찾아서 채워요(AI가 지어내지 않아요). 찾은 내용은 꼭 원문과 비교해 확인하도록 안내해요.

<img src="docs/images/03-application.png" width="860" alt="지원 정보 화면: 공고 원문을 붙여넣고 '명시된 항목 가져오기'를 누른 모습, 위쪽에 진행률 다리" />

### 3. 자기소개서 — 경험을 보며 쓰기
오른쪽 '내 경험' 칸에서 상황·역할·행동·결과를 정리하고 **본문에 넣기**를 누르면, 커서 자리에 내용이 들어가요. 넣은 뒤에는 내 말투로 다듬으면 돼요.

<img src="docs/images/04-cover-letter.png" width="860" alt="자기소개서 쓰기 화면: 왼쪽에 문항과 본문, 오른쪽에 내 경험 칸" />

### 4. 이력서 — 경험이 저절로 들어와요
자기소개서에서 정리한 경험이 '프로젝트·활동'에 **내 경험과 연결됨** 표시와 함께 들어와 있어요.

<img src="docs/images/05-resume.png" width="860" alt="이력서 화면: 프로젝트·활동 1에 '내 경험과 연결됨' 표시, 제목·기간·내용이 채워져 있음" />

<table>
<tr>
<td width="50%" valign="top">

### 5. 면접 연습
질문에 하나씩 답하고, 옆에서 공고와 내 경험을 함께 봐요.

<img src="docs/images/06-interview.png" alt="면접 연습 화면: 질문 1/5와 내 답변 칸" />

</td>
<td width="50%" valign="top">

### 6. 최종 점검
문항별 글자 수와 사실 확인 항목을 체크하고 워드·PDF로 저장해요.

<img src="docs/images/07-review.png" alt="최종 점검 화면: 문항별 미리보기와 점검 체크 항목" />

</td>
</tr>
</table>

<details>
<summary><b>📱 휴대폰에서 보기</b></summary>
<br />
<img src="docs/images/08-mobile-cover-letter.png" width="300" alt="휴대폰 화면의 자기소개서 쓰기" />

화면이 좁으면 메뉴가 위로 모이고, '내 경험' 칸은 본문 아래로 내려가요.
</details>

> 화면 속 회사·사람·경험은 모두 예시예요.

<br />

## 🔗 경험 ↔ 이력서 자동 연결

같은 경험을 두 번 쓰지 않도록, **경험 하나 = 이력서 항목 하나**로 이어 둬요.

```mermaid
flowchart LR
    subgraph exp["✍️ 자기소개서 · 내 경험"]
        e1["제목"]
        e2["기간"]
        e3["상황 · 역할 · 행동 · 결과"]
    end
    subgraph row["📄 이력서 · 프로젝트·활동 / 경력"]
        r1["명칭"]
        r2["기간"]
        r3["내용"]
    end
    e1 <--> r1
    e2 <--> r2
    e3 -->|"역할 · 행동 · 결과를<br/>한 줄씩"| r3
```

- **제목·기간**은 어느 쪽에서 고쳐도 같아져요.
- **내용**은 경험의 역할·행동·결과로 채워져요. 이력서에서 직접 고치면 그 내용은 그대로 남고, "경험 내용으로 다시 채우기"로 되돌릴 수 있어요.
- 경험마다 '프로젝트·활동 / 경력 / 넣지 않기'를 고를 수 있고, 이력서에서 **연결 끊기**도 돼요.
- 예전에 저장한 `.sdi` 파일도 그대로 열려요. 이력서에 같은 제목이 이미 있으면 새로 만들지 않고 그 항목과 이어 줘요.

<br />

## 📌 공고 주소로 가져오기

| 사이트 | 결과 (2026-10-15, 실제 공고 9개 시험) |
| --- | --- |
| 원티드 | 3개 모두 5개 항목 채움 |
| 잡코리아 | 글로 된 공고 2개 모두 5개 항목 채움 · 공고 본문이 따로 있는 안쪽 창까지 읽음 |
| 사람인 | 표로 된 공고도 부문별로 정리 · 안쪽 창 읽기 · 화면에 안 보이는 검색용 글은 제외 |
| 그림으로만 된 공고 | 글자가 없어 읽을 수 없어요 → 회사명·직무만 채우고 "직접 옮겨 적어 주세요" 안내 |

- 서버가 못 가져오면 **AI로 다시 시도**를 눌러, 내가 넣은 AI 키로 AI가 페이지를 읽게 할 수 있어요.
- 안전장치: http/https 주소만, 내부망 주소 차단, 최대 3MB·10초, 우리 화면에서 온 요청만, 같은 사람은 10분에 20번까지.

<br />

## 🏗️ 어떻게 이루어져 있나요

```mermaid
flowchart TB
    subgraph user["🧑 사용자 브라우저"]
        ui["스토리 담 이음 화면<br/>(React)"]
        local[("작성한 글<br/>브라우저 저장 · .sdi 파일")]
        ui <--> local
    end

    subgraph render["☁️ Render 서버 · 저장하는 곳 없음"]
        api1["/api/notices<br/>공지 읽기"]
        api2["/api/job-posting<br/>공고 페이지 받아 오기"]
        api3["/api/ai<br/>AI 요청 전달"]
    end

    subgraph gh["🐙 깃허브 (관리자 저장소)"]
        notices[("data/notices.json<br/>공지 · 자주 묻는 질문")]
        admin["관리자 화면<br/>(깃허브 페이지)"]
    end

    ui --> api1 & api2 & api3
    api1 --> notices
    admin -->|출입 키로 저장| notices
    api2 --> jobs["채용 사이트<br/>사람인 · 잡코리아 · 원티드 …"]
    api3 --> ai["AI 회사<br/>(사용자 키)"]
```

- 서버는 **공지 읽기 · 공고 받아 오기 · AI 요청 전달** 세 가지만 하고, 아무것도 저장하지 않아요.
- 개인 AI 키는 브라우저 탭 메모리에만 있고, 새로고침하면 사라져요.
- 공지는 별도 폴더(`admin-app`)의 관리자 화면에서 쓰고, 그 저장소의 `data/notices.json`에 저장돼요.

<br />

## 🚀 내 컴퓨터에서 실행하기

Node.js **22.12 이상**이 필요해요.

```powershell
npm install
npm run dev          # http://127.0.0.1:5173
```

공지를 보려면 `.env.example`을 복사해 `.env`를 만들고 `NOTICES_URL`을 채워 주세요. 없으면 "게시된 공지가 없습니다"로 나와요.

| 명령 | 하는 일 |
| --- | --- |
| `npm run typecheck` | 코드 형식 오류 확인 |
| `npm run lint` | 코드 규칙 확인 |
| `npm test` | 자동 테스트 57개 (처음 한 번: `npx playwright install chromium`) |
| `npm run build` | 배포용 파일 만들기 (`dist/`, `dist-server/`) |
| `npm start` | 만든 배포용 파일로 서버 실행 (http://localhost:3000) |
| `npm run check:job -- 주소…` | 실제 채용공고를 가져올 수 있는지 시험 (`urls.txt`처럼 주소 목록 파일도 가능, 결과는 `test-results/job-check.md`) |

<br />

## ☁️ Render에 올리기

1. 이 폴더를 깃허브 저장소로 올려요.
2. Render → **+ New → Blueprint** → 저장소를 고르면 `render.yaml`대로 서버가 만들어져요.
3. **Environment**에 값을 넣어요.

   | 이름 | 값 |
   | --- | --- |
   | `NOTICES_URL` | 관리자 화면 아래 "사용자 사이트 연결"에 나오는 공지 파일 주소 |
   | `AI_OPENAI_MODEL` · `AI_GEMINI_MODEL` · `AI_CLAUDE_MODEL` | (선택) AI 첨삭·공고 읽기에 쓸 모델 이름 |

4. 이후에는 깃허브에 `git push`하면 Render가 자동으로 다시 배포해요.

<details>
<summary>무료 서버가 잠들지 않게 하려면</summary>

Render 무료 서버는 15분 동안 접속이 없으면 잠들어요. UptimeRobot 같은 무료 감시 서비스에 `https://story-dam-ieum.onrender.com/api/health`를 10분마다 확인하도록 등록하면 깨어 있어요(월 750시간 무료 범위 안에서).
</details>

<br />

## 📁 폴더 구조

```text
src/                 화면
├─ App.tsx             주소별 화면 연결, 머리글(작업 메뉴·단계), 작업 파일 불러오기, 공지 알림
├─ pages/              화면별 파일 (Login, Home, Application, CoverLetter, Resume, Interview, Review, Notices)
├─ components/         같이 쓰는 부품 (담이, 진행률 다리, 내 경험 칸 ExperienceBox, 입력칸, AI 설정 등)
├─ model.ts            작업 데이터 형식, 진행률, .sdi 검사, 경험↔이력서 연결 규칙
├─ store.tsx           작업 상태, 지원서 여러 개, 브라우저 임시저장
├─ export.ts           워드·PDF 만들기
└─ services.ts         파일 읽기, 서버 요청(AI·공고·공지)
server/              Render에서 돌아가는 서버
├─ app.ts              /api 기능 모음
├─ jobPage.ts          공고 페이지에서 글·항목 뽑기 (사이트별 맞춤 처리 포함)
├─ safeFetch.ts        안전하게 페이지 받아 오기
└─ ai.ts               AI 요청 전달
shared/              화면과 서버가 같이 쓰는 규칙 (공고 항목 찾기, 공지 형식)
scripts/check-job.ts 실제 공고 가져오기 시험 도구
tests/               자동 테스트 (화면 · 서버 · 경험 연결 · 시험용 공고 페이지)
docs/                개발 기록, 디자인 안내, README 화면 캡처
```

<br />

## 📝 개발 기록

작업 내용·오류·해결 과정은 **[docs/dev-log](docs/dev-log/DEV_LOG_INDEX.md)** 에 주 단위로 남기고 있어요.

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-10-15 | 자기소개서·면접은 공고부터 시작, '내 경험'을 쓰기 화면에 합침, 경험↔이력서 자동 연결, 실제 공고 9개로 사이트별 맞춤 처리, Render 배포 |
| 2026-10-15 | 지원서 여러 개, 백업 알림, 글자 수 세는 방법, 마감일 D-day, 새 공지 표시, AI로 공고 읽기 |
| 2026-10-14 | 사용자 사이트(Render)와 관리자 화면(깃허브 페이지) 분리, 서버를 Node 하나로 단순화, 코드 정리 |

<div align="center">
<br />
<sub>담이와 함께, 당신의 다음을 응원합니다 🦫</sub>
</div>
