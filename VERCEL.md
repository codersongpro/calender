# Vercel 배포 준비

이 앱은 Vercel에서 Next.js 프로젝트로 바로 배포할 수 있습니다. 학교별 설정은 서버 파일이나 환경변수가 아니라 Neon Postgres에 저장합니다.

## 1. GitHub 연결

Vercel에서 `codersongpro/calender` 저장소를 Import합니다.

## 2. Neon Postgres 연결

Vercel Marketplace에서 Neon을 프로젝트에 연결합니다. 연결 후 `DATABASE_URL`이 Vercel 환경변수로 주입되어야 합니다.

## 3. Google Sheets 서비스 계정

Google Cloud에서 서비스 계정을 만들고 Sheets API를 활성화합니다. 서비스 계정 이메일을 각 학교의 Google Spreadsheet에 `편집자`로 공유합니다.

Vercel Project Settings → Environment Variables에 아래 값 중 하나의 방식을 추가합니다.

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account-name@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

또는 JSON 전체를 하나의 변수로 넣을 수 있습니다.

```bash
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

## 4. 운영자 비밀번호

운영자 비밀번호 해시를 만들고 Vercel 환경변수에 넣습니다.

```bash
npm install
npm run hash-password -- "운영자비밀번호"
```

필수 환경변수는 다음과 같습니다.

```bash
DATABASE_URL=postgresql://...
OPERATOR_PASSWORD_HASH=pbkdf2:...
APP_SECRET=긴-랜덤-문자열
```

선택 환경변수:

```bash
OPERATOR_SESSION_SECRET=운영자-세션-전용-긴-랜덤-문자열
PUBLIC_DATA_SERVICE_KEY=공공데이터포털서비스키
```

`OPERATOR_SESSION_SECRET`이 없으면 `APP_SECRET`을 운영자 세션 서명에 사용합니다.

## 5. 운영

1. 배포 후 `/admin`에 접속합니다.
2. 운영자 비밀번호로 로그인합니다.
3. 학교별 기관명, 학교코드, 빈 스프레드시트 주소, 조회/편집/관리 비밀번호를 입력합니다.
4. 생성 후 발급된 `/s/학교코드`, `/s/학교코드/admin` 주소를 학교에 전달합니다.
5. 학교 사이트를 일시 중지해야 하면 `/admin`에서 상태를 `중지`로 바꿉니다.
