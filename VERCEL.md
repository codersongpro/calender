# Vercel 배포 준비

이 앱은 Vercel에서 Next.js 프로젝트로 바로 배포할 수 있습니다. Vercel 서버리스 환경에서는 프로젝트 폴더에 설정 파일을 영구 저장할 수 없으므로, 운영 설정은 환경변수로 관리합니다.

## 1. GitHub 연결

Vercel에서 `codersongpro/calender` 저장소를 Import합니다.

## 2. 필수 환경변수

Vercel Project Settings → Environment Variables에 아래 값을 Production, Preview, Development에 추가합니다.

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account-name@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
APP_SECRET=긴-랜덤-문자열
ORG_NAME=기관명
SPREADSHEET_ID=구글스프레드시트ID
EDIT_PASSWORD_HASH=편집비밀번호해시
ADMIN_PASSWORD_HASH=관리비밀번호해시
PUBLIC_DATA_SERVICE_KEY=공공데이터포털서비스키
```

`GOOGLE_SERVICE_ACCOUNT_JSON` 하나로 서비스 계정 JSON 전체를 넣어도 됩니다.

## 3. 비밀번호 해시 만들기

로컬에서 아래 명령으로 해시를 만들고, 결과를 Vercel 환경변수에 넣습니다.

```bash
npm install
npm run hash-password -- "편집비밀번호"
npm run hash-password -- "관리비밀번호"
```

## 4. 구글 스프레드시트 공유

서비스 계정 이메일을 연결할 구글 스프레드시트에 `편집자`로 공유합니다. 앱이 첫 조회 또는 설정 확인 시 `Events`, `Categories`, `Holidays`, `Settings`, `EditLog` 탭을 자동으로 만들고 사용합니다.

## 5. 로컬 설정 화면

로컬 개발이나 일반 Node 서버 자체 호스팅에서는 첫 화면의 설정 저장 기능을 사용할 수 있습니다. Vercel에서는 환경변수를 원본 설정으로 사용합니다.
