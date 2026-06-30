# 월별 행사계획 웹앱

독립 Next.js 웹앱이며, 행사 원본 데이터는 기관별 Google Spreadsheet에 저장합니다.

## 실행

```bash
npm install
npm run dev
```

## Google Sheets 연결

1. Google Cloud에서 서비스 계정을 만들고 Sheets API를 활성화합니다.
2. 서비스 계정 이메일을 기관의 구글 스프레드시트에 편집자로 공유합니다.
3. `.env.local`에 `.env.example`의 서비스 계정 값을 설정합니다.
4. 웹앱 첫 화면에서 기관명, 스프레드시트 주소, 편집/관리 비밀번호, 공공데이터포털 서비스키를 저장합니다.

앱은 연결된 스프레드시트에 `Events`, `Categories`, `Holidays`, `Settings`, `EditLog` 탭을 생성하고 관리합니다.

Vercel 배포 설정은 [`VERCEL.md`](./VERCEL.md)를 참고하세요.

## 기간

학년도는 항상 3월 1일부터 다음 해 2월 말일까지입니다.

## 테스트

```bash
npm test
```
