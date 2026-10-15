# 공고 가져오기 시험용 페이지 (2026-10-15 실제 공고에서 줄여 만든 것)

- 사이트 구조(내부 창 주소, 숨김 글, JSON-LD·Next.js 데이터 위치)는 실제 페이지 그대로 두고, 광고·메뉴·스크립트와 긴 반복 내용은 뺐습니다.
- `*-detail.html`: 공고 본문이 들어 있는 내부 창(iframe) 페이지 — 사람인 `relay/view-detail`, 잡코리아 `GI_Read_Comt_Ifrm`.
- 사용처: `tests/server.spec.ts`의 사이트별 맞춤 처리 테스트.
