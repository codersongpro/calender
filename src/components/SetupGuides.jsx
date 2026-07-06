export function PublicDataServiceKeyGuide({ saveLabel = "설정 저장", refreshText = "오른쪽의 공휴일 갱신" }) {
  return (
    <details className="guide-box wide">
      <summary>공공데이터포털 서비스키 넣는 방법</summary>
      <ol>
        <li>공공데이터포털(data.go.kr)에 로그인한 뒤 한국천문연구원 특일 정보 API를 활용신청합니다.</li>
        <li>마이페이지의 Open API 활용 내역에서 인증키를 확인합니다.</li>
        <li>일반 인증키를 복사해 이 입력란에 붙여넣고 {saveLabel}을 누릅니다.</li>
        <li>모든 학교가 같은 키를 쓰면 서버 환경변수 <code>PUBLIC_DATA_SERVICE_KEY</code>에 넣고, 학교별 키가 필요할 때만 이 칸에 저장합니다.</li>
        <li>저장 후 {refreshText}을 눌러 해당 학년도 공휴일을 가져옵니다.</li>
      </ol>
    </details>
  );
}

export function GoogleServiceAccountGuide() {
  return (
    <details className="guide-box wide">
      <summary>Google 서비스 계정 환경변수 넣는 방법</summary>
      <ol>
        <li>Google Cloud Console에서 프로젝트를 만들거나 선택하고 Google Sheets API를 사용 설정합니다.</li>
        <li>IAM 및 관리자에서 서비스 계정을 만든 뒤 키 추가 메뉴에서 JSON 키 파일을 내려받습니다.</li>
        <li>JSON의 <code>client_email</code> 값을 각 학교 Google Spreadsheet 공유 창에 편집자로 추가합니다.</li>
        <li>Vercel Project Settings의 Environment Variables에 <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>으로 JSON 전체를 넣습니다.</li>
        <li>분리해서 넣고 싶다면 <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>에는 <code>client_email</code>, <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>에는 <code>private_key</code> 값을 넣습니다.</li>
        <li>로컬 실행은 <code>.env.local</code>에 같은 값을 넣고 개발 서버를 다시 시작합니다. Vercel은 환경변수 저장 후 재배포해야 적용됩니다.</li>
      </ol>
    </details>
  );
}
