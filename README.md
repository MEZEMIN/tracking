# tracking — 업무 트래킹 & 일정 관리

우선순위 정리, 프로젝트 데드라인 D-Day 확인, 캘린더를 한곳에서 보는 웹앱입니다.
빌드 도구 없이 순수 HTML/CSS/JS로 만들어져 GitHub Pages에 그대로 올라갑니다.

## 두 개의 앱

| | 경로 | 용도 |
|---|---|---|
| **조회 앱** | `/` | 읽기 전용 대시보드. 팀원·상사에게 링크를 공유합니다. |
| **입력 앱** | `/input/` | 내가 업무를 등록·수정하는 편집기. 데이터는 **내 브라우저에만** 저장됩니다. |

입력 앱에서 편집한 내용은 자동으로 브라우저에 저장되지만, 그것만으로는 조회 앱에
반영되지 않습니다. 보고할 시점에 **게시**를 해야 공유 화면이 갱신됩니다.

## 게시하는 방법

1. 입력 앱에서 **게시용 파일 내보내기**를 누릅니다 → `data.json` 이 다운로드됩니다.
2. 그 파일을 이 저장소 최상단의 `data.json` 에 덮어씁니다.
3. 커밋 & 푸시합니다.

```bash
cp ~/Downloads/data.json .
git add data.json && git commit -m "업무 현황 갱신" && git push
```

푸시하고 1분 내외면 GitHub Pages에 반영됩니다.

## GitHub Pages 켜기 (최초 1회)

저장소 → **Settings → Pages → Build and deployment**에서
Source를 `Deploy from a branch`, 브랜치를 `main` / `/ (root)` 로 지정합니다.

- 조회 앱: `https://mezemin.github.io/tracking/`
- 입력 앱: `https://mezemin.github.io/tracking/input/`

> 입력 앱도 공개 URL이지만, 저장되는 데이터는 **접속한 사람의 브라우저 안에만**
> 남습니다. 다른 사람이 열어도 내 업무는 보이지 않고, 그 사람이 뭘 입력해도 내
> 데이터에는 영향이 없습니다. 공유 화면을 바꾸려면 저장소에 커밋할 권한이 필요합니다.

## 화면

**조회 앱**
- **우선순위** — 마감 임박도(마감 지남 / 오늘 / 3일 이내 / 이번 주 / 이후)로 묶은 목록. D-Day 배지, 진척률 바
- **캘린더** — 마감일 기준 월간 달력
- **프로젝트** — 프로젝트별 완료율과 다음 마감

**입력 앱** — 프로젝트(이름·색상) 관리, 업무 CRUD, 우선순위/상태/진척률/시작일·마감일/
예상·실제 소요 시간/체크리스트/메모, 백업 내보내기·가져오기

## 데이터 형식

`data.json` 한 파일에 모든 게 들어갑니다. 스키마는 [`shared/store.js`](shared/store.js) 참고.

```jsonc
{
  "version": 1,
  "publishedAt": "2026-09-02T09:00:00.000Z",
  "projects": [{ "id": "...", "name": "브랜드 리뉴얼", "color": "#3f74c4" }],
  "tasks": [{
    "id": "...", "title": "...", "projectId": "...",
    "priority": "high | mid | low",
    "status": "todo | doing | done",
    "progress": 0,                    // 0~100
    "startDate": "2026-08-24",        // 없으면 null
    "dueDate": "2026-08-28",          // D-Day 계산 기준
    "estimateHours": 8, "spentHours": 6,
    "notes": "...",
    "checklist": [{ "id": "...", "text": "...", "done": false }]
  }]
}
```

현재 올라와 있는 `data.json` 은 화면 확인용 **샘플 데이터**이며, 처음 게시하면
실제 데이터로 대체됩니다.

## 백업

입력 앱의 **백업 내보내기**로 언제든 전체 데이터를 파일로 저장할 수 있고,
**가져오기**로 되돌릴 수 있습니다. 브라우저 저장소를 지우면 데이터가 사라지므로
가끔 백업해 두는 것을 권합니다.

## 로컬에서 실행

`file://` 로 열면 `fetch`가 막혀 조회 앱이 데이터를 못 읽습니다. 간단한 서버로 여세요.

```bash
python3 -m http.server 8000
```

Node가 있다면 저장소에 들어있는 작은 서버를 써도 됩니다.

```bash
node serve.js
```
