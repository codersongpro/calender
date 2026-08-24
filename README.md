# 월별 행사계획 웹앱

Next.js 기반 멀티테넌트 웹앱입니다. 앱은 한 번만 배포하고, 학교별 사이트는 `/s/학교코드` 주소로 제공합니다.

## 실행

```bash
npm install
npm run dev
```

로컬에서 실행할 때는 `.env.local`에 환경변수를 넣고 개발 서버를 다시 시작합니다. Vercel 배포에서는 Project Settings → Environment Variables에 같은 값을 넣은 뒤 재배포합니다.

## 서비스키와 환경변수

Google Spreadsheet를 읽고 쓰려면 Google 서비스 계정 환경변수가 필요합니다. Google Cloud에서 Sheets API를 사용 설정하고 서비스 계정 JSON 키를 만든 뒤, 아래 방식 중 하나로 넣습니다.

```bash
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

또는 JSON에서 값을 나누어 넣을 수 있습니다.

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account-name@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

서비스 계정의 `client_email`은 각 학교 Google Spreadsheet에 `편집자`로 공유해야 합니다.

`error:1E08010C:DECODER routines::unsupported` 오류가 나면 서비스 계정 `private_key` 값이 잘못 들어간 것입니다. `private_key_id`가 아니라 `-----BEGIN PRIVATE KEY-----`로 시작하는 `private_key` 전체를 넣었는지 확인하고, 줄바꿈 `\n`이 깨지지 않게 복사해 주세요.

공휴일 자동 갱신에는 공공데이터포털 서비스키가 필요합니다. 모든 학교가 같은 키를 쓰면 환경변수에 기본값을 넣습니다.

```bash
PUBLIC_DATA_SERVICE_KEY=공공데이터포털서비스키
```

학교별로 다른 키를 써야 하면 `/admin`에서 학교 생성 시 입력하거나 `/s/학교코드/admin`의 `공공데이터포털 서비스키` 입력란에 저장합니다. 학교별 저장 키가 있으면 `PUBLIC_DATA_SERVICE_KEY`보다 우선합니다.

## 운영 흐름

1. 운영자는 `/admin`에서 처음 사용할 메인 운영자 비밀번호를 설정합니다.
2. 이후 `/admin`에서 메인 운영자 비밀번호로 로그인합니다.
3. 기관명, 학교코드, 빈 Google Spreadsheet 주소, 학교 운영자 비밀번호를 입력해 학교 사이트를 생성합니다.
4. 앱은 해당 스프레드시트에 `Events`, `Categories`, `Holidays`, `Settings`, `EditLog` 탭을 생성합니다.
5. 학교 구성원은 `/s/학교코드`에서 별도 비밀번호 없이 월별 계획을 보고 편집합니다.
6. 학교 담당자는 `/s/학교코드/admin`에서 학교 운영자 비밀번호로 학교 설정, 비밀번호 변경, 공휴일 갱신, 기존 월별 탭 가져오기를 관리합니다.

## 저장소

- 학교별 행사 원본 데이터: 각 학교의 Google Spreadsheet
- 학교 설정과 비밀번호 해시: Neon Postgres `tenants` 테이블
- 세션: HttpOnly 쿠키

## 보안과 개인정보

- 조회와 편집은 주소를 아는 누구나 가능하며, 학교관리·운영자 권한만 비밀번호로 분리됩니다.
- 비밀번호 원문은 저장하지 않고 PBKDF2 해시만 저장합니다.
- 운영자도 학교 비밀번호 원문을 볼 수 없고 재설정만 할 수 있습니다.
- 메인 운영자 비밀번호와 학교 운영자 비밀번호는 앱 화면에서 이후 변경할 수 있습니다.
- 학생 개인정보, 상담/건강/징계 등 민감정보는 일정 제목, 담당자, 장소 칸에 입력하지 않는 운영 원칙을 권장합니다.

## 기간

학년도는 항상 3월 1일부터 다음 해 2월 말일까지입니다.

## 테스트

```bash
npm test
```

Vercel 배포 설정은 [`VERCEL.md`](./VERCEL.md)를 참고하세요.
