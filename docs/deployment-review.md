# 웹 배포·광고 출시 체크리스트

## 기술적으로 확인한 사항

- Node.js 22.12 이상에서 `npm ci`, `npm run build` 후 **`dist/`만** 정적 호스팅에 올리면 됩니다. 원본 리포지토리의 `index.html`을 그대로 올리면 Vite에서 처리해야 할 TypeScript와 스타일 경로가 남습니다. 게임 서버나 Meshy 키는 필요하지 않습니다.
- Vite는 상대 경로(`base: './'`)를 사용합니다. 실제 프로덕션 파일을 `/like-wow/` 아래에서 서빙해 냉기·화염 모델과 Puff GLB를 불러오고, 개발용 `?stage=8`이 무시되며 1스테이지가 시작됨을 확인했습니다.
- 전나무와 바위 적용 후 `dist/`는 **16.75 MiB**이며 최대 단일 파일은 루미 GLB **6.69 MiB**입니다. Puff GLB는 **267 KiB**, 두 지형 GLB는 합계 약 **566 KiB**입니다. `/like-wow/` 아래로 서빙한 로컬 캐시 없는 브라우저에서 시작까지 받은 응답 본문은 냉기 **8.08 MiB**, 화염 **5.53 MiB**였습니다. 개발용 `3d-models/` 원본과 테스트 캡처는 빌드 산출물에 포함되지 않습니다.
- [GitHub Actions 워크플로](../.github/workflows/deploy-pages.yml)는 `main`에 푸시하거나 수동 실행하면 `dist/`만 GitHub Pages에 업로드합니다. `3d-models/` 원본과 로컬 환경 파일은 Git에서 제외합니다. `VITE_*` 변수도 브라우저 번들에 노출될 수 있으므로 비밀 키를 담으면 안 됩니다.
- 강화 포인트와 최고 기록은 브라우저의 `localStorage`에 저장됩니다. `github.io`에서 자체 도메인으로 옮기면 저장값은 자동으로 따라오지 않습니다. 현재는 키보드·마우스와 WebGL 2가 필요합니다.
- 공개용 소개와 검색용 설명에 실제 플레이 시간(30분)과 데스크톱 지원 범위를 표시합니다.

## 공개 전에 확인할 권리

| 항목 | 확인할 것 |
| --- | --- |
| `red-hood-magician.glb` | 프로젝트에 원본 제공자의 상업 이용·웹 배포 허가가 기록되어 있지 않습니다. 출처와 허가를 확인하거나 배포 가능한 모델로 교체하세요. |
| 루미 모션 | [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)는 상업 게임 이용을 안내하지만, [원본 파일 재배포](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400)는 별도 제한됩니다. 원본을 공개 저장소에 올리지 말고, 브라우저에서 직접 내려받는 런타임 GLB에 포함된 모션의 배포 형태도 확인하세요. |
| Puff 등 Meshy 에셋 | [Meshy 생성물 라이선스](https://help.meshy.ai/en/articles/16102098-can-i-use-meshy-assets-commercially)는 생성 당시 플랜에 따라 다릅니다. 크레딧을 사용해 생성했더라도 [첨부 참조 이미지의 권리](https://help.meshy.ai/en/articles/16103168-copyright-checklist-for-meshy-reference-images-and-assets)는 따로 확인해야 합니다. |
| 라이브러리·폰트 | Three.js의 MIT 고지와 Noto Sans KR·Space Grotesk의 OFL 1.1 저작권·라이선스 문구는 [배포용 고지](../public/third-party-notices.txt)에 포함됩니다. |

비공개 Git 저장소를 써도 정적 사이트가 이용자에게 보내는 JS·GLB 파일은 내려받을 수 있습니다. 호스팅을 바꾸는 것으로 웹 재배포 권한 문제가 해결되지는 않습니다.

## 호스팅과 광고 추천

- **쇼케이스·무료 데모:** [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)로도 배포할 수 있습니다. 월 대역폭 소프트 한도는 100 GB입니다. GitHub는 Pages의 온라인 사업 호스팅을 제한하며 [기부 버튼 등 일부 수익화는 허용](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#pages)합니다. [광고 자체를 일괄 금지하지는 않지만](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#10-advertising-on-github), 광고 수익을 목표로 운영할 서비스는 별도 호스팅을 권합니다.
- **운영본:** GitHub는 소스 관리에 쓰고, [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)나 상업 이용을 허용하는 정적 호스트에 `dist/`를 자체 도메인으로 연결하는 편이 좋습니다. 현재 산출물은 [Workers Static Assets 단일 파일 한도 25 MiB](https://developers.cloudflare.com/workers/platform/limits/#static-assets)보다 작습니다.
- **광고:** 먼저 광고 없이 첫 판 시작률·재도전율을 확인하고, 이후 [AdSense H5 Games Ads](https://support.google.com/adsense/answer/9959170?hl=en)를 신청해 결과 화면에서 재도전으로 넘어갈 때만 가끔 전면 광고를 시험하는 편을 권합니다. 첫 진입·전투 중에는 피하고, 동의 거부·광고 차단·광고 로드 실패에도 게임이 진행되게 하세요. [일반 광고 클릭을 유도하거나 보상하지 마세요](https://support.google.com/adsense/answer/48182?hl=en).
- [AdSense H5 Games Ads는 신청·승인 방식](https://support.google.com/adsense/answer/1705831?hl=en)입니다. 사이트 소유권, 개인정보·쿠키 안내 및 [지역별 동의](https://support.google.com/adsense/answer/10961068?hl=en)를 확인하세요. 권장되는 [`ads.txt`](https://support.google.com/adsense/answer/12171612?hl=en)는 `/<repo>/ads.txt`가 아니라 광고에 사용하는 도메인의 루트에 두는 것이 기준입니다.
- 한국 이용자에게 공개한다면 웹 배포라도 [게임산업법 제21조](https://www.law.go.kr/법령/게임산업진흥에관한법률/제21조)상 등급분류 대상인지, 예외에 해당하는지 게임물관리위원회에 먼저 확인하세요.

GitHub Pages 워크플로는 광고 없이 플레이할 수 있는 데모를 배포합니다.
