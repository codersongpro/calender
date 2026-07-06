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

처음 설정하는 순서는 다음과 같습니다.

1. Google Cloud Console에서 프로젝트를 만들거나 선택합니다.
2. Google Sheets API를 사용 설정합니다.
3. IAM 및 관리자 → 서비스 계정에서 새 서비스 계정을 만듭니다.
4. 해당 서비스 계정의 키 추가 메뉴에서 JSON 키를 내려받습니다.
5. JSON의 `client_email`을 각 학교 스프레드시트 공유 창에 `편집자`로 추가합니다.
6. Vercel 환경변수에 `GOOGLE_SERVICE_ACCOUNT_JSON` 또는 `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`를 저장하고 재배포합니다.

`error:1E08010C:DECODER routines::unsupported` 오류가 나면 `private_key` 값이 PEM 형식으로 들어가지 않은 상태입니다. JSON의 `private_key_id`가 아니라 `private_key` 전체를 넣었는지, `-----BEGIN PRIVATE KEY-----`와 `-----END PRIVATE KEY-----`가 포함되어 있는지, 줄바꿈 `\n`이 깨지지 않았는지 확인합니다.

`Google Sheets API has not been used ... or it is disabled` 오류가 나면 서비스 계정 JSON의 Google Cloud 프로젝트에서 Google Sheets API가 꺼져 있는 상태입니다. 오류 메시지의 `activationUrl`에 접속해 API를 사용 설정하고 몇 분 뒤 다시 점검합니다.

## 4. 공공데이터포털 서비스키

공휴일 자동 갱신은 공공데이터포털의 한국천문연구원 특일 정보 API 서비스키를 사용합니다.

1. 공공데이터포털(data.go.kr)에 로그인합니다.
2. 한국천문연구원 특일 정보 API를 활용신청합니다.
3. 마이페이지의 Open API 활용 내역에서 일반 인증키를 복사합니다.
4. 모든 학교가 같은 키를 쓰면 Vercel 환경변수에 기본값을 넣습니다.

```bash
PUBLIC_DATA_SERVICE_KEY=공공데이터포털서비스키
```

학교별로 다른 키를 써야 하면 `/admin`에서 학교 생성 시 입력하거나 `/s/학교코드/admin`에서 저장합니다. 학교별 저장 키가 있으면 `PUBLIC_DATA_SERVICE_KEY`보다 우선합니다.

`공휴일 API 호출 실패: 403 Forbidden` 오류가 나면 서비스키가 거부된 상태입니다. 한국천문연구원 특일 정보 API 활용신청이 승인되었는지 확인하고, 공공데이터포털 인증키 중 가능하면 `Decoding` 키를 저장합니다. `Encoding` 키를 저장했다면 앱이 보정하지만, 계속 실패하면 Decoding 키로 다시 저장한 뒤 재시도합니다.

## 5. 메인 운영자 비밀번호

기본 방식은 배포 후 `/admin`에서 처음 사용할 메인 운영자 비밀번호를 설정하는 것입니다. 설정한 값은 Neon Postgres의 `app_settings` 테이블에 PBKDF2 해시로 저장됩니다.

환경변수로 미리 bootstrap하려면 운영자 비밀번호 해시를 만들고 `OPERATOR_PASSWORD_HASH`에 넣을 수 있습니다.

```bash
npm install
npm run hash-password -- "운영자비밀번호"
```

필수 환경변수는 다음과 같습니다.

```bash
DATABASE_URL=postgresql://...
APP_SECRET=긴-랜덤-문자열
```

선택 환경변수:

```bash
OPERATOR_SESSION_SECRET=운영자-세션-전용-긴-랜덤-문자열
OPERATOR_PASSWORD_HASH=pbkdf2:...
PUBLIC_DATA_SERVICE_KEY=공공데이터포털서비스키
```

`OPERATOR_SESSION_SECRET`이 없으면 `APP_SECRET`을 운영자 세션 서명에 사용합니다.

## 6. 운영

1. 배포 후 `/admin`에 접속합니다.
2. 처음 접속했다면 메인 운영자 비밀번호를 설정하고, 이후에는 그 비밀번호로 로그인합니다.
3. 학교별 기관명, 학교코드, 빈 스프레드시트 주소, 조회/편집/학교 운영자 비밀번호를 입력합니다.
4. 생성 후 발급된 `/s/학교코드`, `/s/학교코드/admin` 주소를 학교에 전달합니다.
5. 메인 운영자 비밀번호는 `/admin`에서, 학교 운영자 비밀번호는 `/s/학교코드/admin`에서 변경할 수 있습니다.
6. 학교 사이트를 일시 중지해야 하면 `/admin`에서 상태를 `중지`로 바꿉니다.
