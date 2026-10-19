# FLUX MOTION

브라우저에서 직접 조율하고 내보내는 오리지널 모션그래픽 실험실. Canvas로 그리는 여섯 장면을 하나의 인터랙티브 작업 공간에서 다룹니다. 런타임 라이브러리, 외부 폰트, 빌드 과정, npm 패키지 의존성이 없습니다.

## 바로 실행

가장 간단한 방법은 **`FLUX.html`을 다운로드해 브라우저에서 여는 것**입니다. 단일 파일에 화면과 모든 모션 코드가 들어 있습니다. 별도 설치 없이 오프라인에서도 사용할 수 있습니다. 설정 링크를 다른 사람과 공유하려면 HTTP 서버나 정적 호스팅에서 실행하세요.

Node.js 20 이상에서 저장소 폴더를 열고 실행합니다.

```sh
npm start
```

브라우저에서 <http://127.0.0.1:4173>에 접속하세요. 패키지 설치나 `npx`는 필요 없습니다. 서버를 종료하려면 터미널에서 Ctrl+C를 누릅니다. 다른 포트는 `PORT` 환경변수로 지정할 수 있습니다. 정적 파일을 제공하는 호스팅에도 배포할 수 있습니다.

소스를 수정한 뒤 단일 파일 버전을 다시 만들려면 `node bundle.mjs`를 실행합니다. `index.html`에서 실행할 때는 빌드가 필요 없습니다.

## 조작

- 여섯 Canvas 장면을 선택하고 재생하거나 타임라인을 이동합니다.
- 텍스트, 재생 속도, 강도, 디테일과 Acid / Ember / Ice / Mono 팔레트를 조정합니다.
- PNG로 현재 프레임을 저장하거나 8초 분량의 WebM 클립을 녹화합니다.
- 프리셋을 JSON으로 저장·불러오고, URL로 설정을 공유합니다.
- 화면 비율은 16:10(스튜디오), 16:9(가로), 1:1(정사각), 9:16(세로)을 지원합니다.
- 데스크톱과 모바일 화면에 맞춰 조작부가 재배치됩니다. 시스템의 모션 감소 설정을 존중합니다.

WebM은 브라우저의 `canvas.captureStream()`과 `MediaRecorder`를 사용하는 **실시간 녹화**입니다. 지원되는 브라우저에서만 사용할 수 있으며, 브라우저 상태와 기기 성능이 결과 프레임에 영향을 줍니다. 녹화 중에는 탭을 활성화해 두세요. 프레임 단위 오프라인 렌더러나 MP4 변환기는 포함하지 않습니다. PNG와 프리셋 저장은 별도로 사용할 수 있습니다.

## 설계와 검증

코어는 시드와 장면 시간으로 화면을 계산합니다. 동일한 설정과 시간은 같은 장면 구성을 만들며, 타임라인을 앞뒤로 이동해도 경과 프레임에 의존하지 않습니다. 브라우저·운영체제별 글꼴과 Canvas 렌더링 차이까지 동일한 픽셀을 보장하지는 않습니다.

```sh
npm test
npm run check
```

테스트는 코어 동작과 로컬 서버의 요청 처리·경로 보안을 검증합니다. 소스 검사는 JavaScript 문법, 로컬 모듈 연결, 패키지 의존성 및 원격 스크립트·스타일시트 의존성을 확인합니다. 로컬 서버는 기본적으로 `127.0.0.1`에만 연결되며 경로 탈출과 루트 밖 심볼릭 링크 접근을 차단합니다.

## 소스 구성과 장면

모든 파일은 저장소 루트에 있습니다. `index.html`과 `style.css`가 화면을 구성하고, `app.js`가 조작·타임라인·저장을 연결합니다. `renderer.js`는 여섯 Canvas 장면을 그리며, `state.js`는 프리셋 검증과 출력 크기를 계산합니다. `serve.mjs`는 로컬 실행 서버, `check.mjs`와 `*.test.mjs`는 소스 검사와 테스트입니다.

| 장면 | 프리셋 ID | 표현 |
| --- | --- | --- |
| Vortex study | `vortex` | 3D 투영으로 회전하는 입자 조형 |
| Type in motion | `kinetic` | 입력한 문장을 움직이는 키네틱 타이포 |
| Orbital mechanics | `orbit` | 궤도를 따라 흐르는 빛과 잔상 |
| Wave terrain | `terrain` | 파형으로 구성한 생성형 지형 |
| Infinite tunnel | `tunnel` | 깊이와 원근감을 가진 터널 |
| Radial bloom | `bloom` | 방사형 규칙으로 피어나는 유기적 기하 |

## 출처와 라이선스

[gongnyang/awesome-ai-motion](https://github.com/gongnyang/awesome-ai-motion)의 모션 기법 가이드에서 아이디어를 얻었습니다. 이 프로젝트의 화면, 애니메이션 코드와 도구는 새로 작성했으며, 원본의 코드·클립·폰트·GSAP 파일을 포함하지 않습니다.

MIT © 2026 kimoong1. [LICENSE](LICENSE)를 참고하세요.

---

An original browser motion graphics instrument with six Canvas scenes, live controls, timeline seeking, PNG capture, real-time WebM recording, and portable JSON / URL presets. Requires Node.js 20+ only for the local static server; run `npm start`, then open <http://127.0.0.1:4173>. No package installation or build is required. WebM recording depends on browser support and is not a frame-perfect offline renderer.
