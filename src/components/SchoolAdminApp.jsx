"use client";

import { useEffect, useMemo, useState } from "react";

import { PasswordUnlock, StatusBar } from "./PlannerApp.jsx";
import { GoogleServiceAccountGuide, PublicDataServiceKeyGuide } from "./SetupGuides.jsx";

export default function SchoolAdminApp({ slug }) {
  const basePath = useMemo(() => `/api/schools/${encodeURIComponent(slug)}`, [slug]);
  const [config, setConfig] = useState(null);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [holiday, setHoliday] = useState({ date: "", name: "", type: "재량휴업일", memo: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadConfig();
  }, [basePath]);

  async function loadConfig() {
    await request(`${basePath}/config`, { setData: setConfig, quiet: true });
  }

  async function request(url, { method = "GET", body, setData, label, quiet = false } = {}) {
    setError("");
    if (!quiet) setStatus("처리 중입니다.");
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus("");
      setError(data.error || "요청을 처리하지 못했습니다.");
      return null;
    }
    if (setData) setData(data);
    if (!quiet) setStatus(label || "완료되었습니다.");
    return data;
  }

  async function unlock(password) {
    const data = await request(`${basePath}/auth/admin`, {
      method: "POST",
      body: { password },
      label: "학교 관리 권한이 열렸습니다.",
    });
    if (data?.authenticated) await loadConfig();
  }

  async function saveSettings(event) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget).entries());
    const publicDataServiceKey = String(input.publicDataServiceKey ?? "").trim();
    const clearPublicDataServiceKey = input.clearPublicDataServiceKey === "true";
    if (clearPublicDataServiceKey) {
      input.clearPublicDataServiceKey = true;
    } else {
      delete input.clearPublicDataServiceKey;
      if (publicDataServiceKey) input.publicDataServiceKey = publicDataServiceKey;
      else delete input.publicDataServiceKey;
    }
    const data = await request(`${basePath}/config`, {
      method: "PATCH",
      body: input,
      label: "학교 설정을 저장했습니다.",
    });
    if (data) await loadConfig();
  }

  async function refreshHolidays() {
    const data = await request(`${basePath}/holidays/refresh`, {
      method: "POST",
      body: { schoolYear },
      label: "공휴일을 갱신했습니다.",
    });
    if (data) await loadConfig();
  }

  async function importLegacy() {
    await request(`${basePath}/import`, {
      method: "POST",
      body: { schoolYear },
      label: "기존 월별 탭을 가져왔습니다.",
    });
  }

  async function saveHoliday(event) {
    event.preventDefault();
    const data = await request(`${basePath}/holidays`, {
      method: "POST",
      body: holiday,
      label: "휴일을 저장했습니다.",
    });
    if (data) setHoliday({ date: "", name: "", type: "재량휴업일", memo: "" });
  }

  if (!config) return <div className="loading">불러오는 중</div>;

  if (!config.exists) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <p className="eyebrow">학교 관리</p>
          <h1>등록되지 않은 주소입니다.</h1>
        </section>
      </main>
    );
  }

  if (config.status === "suspended") {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <p className="eyebrow">학교 관리</p>
          <h1>현재 사용이 중지되었습니다.</h1>
        </section>
      </main>
    );
  }

  if (!config.canAdmin) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <div className="setup-heading">
            <p className="eyebrow">학교 관리</p>
            <h1>학교 운영자 비밀번호를 입력해 주세요.</h1>
          </div>
          <PasswordUnlock label="학교 운영자 비밀번호" buttonLabel="관리 열기" onSubmit={unlock} />
          <StatusBar status={status} error={error} />
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">학교 관리</p>
          <h1>{config.orgName}</h1>
        </div>
        <div className="top-actions">
          <a className="secondary-link" href={`/s/${encodeURIComponent(slug)}`}>
            월별 계획
          </a>
        </div>
      </header>

      <section className="admin-layout">
        <form className="setup-panel form-grid" onSubmit={saveSettings}>
          <label>
            <span>기관명</span>
            <input name="orgName" defaultValue={config.orgName} required />
          </label>
          <label>
            <span>스프레드시트 주소 또는 ID</span>
            <input name="spreadsheetUrl" defaultValue={config.spreadsheetId} required />
          </label>
          <label>
            <span>조회 비밀번호 변경</span>
            <input name="viewPassword" type="password" minLength={4} />
          </label>
          <label>
            <span>편집 비밀번호 변경</span>
            <input name="editPassword" type="password" minLength={4} />
          </label>
          <label>
            <span>학교 운영자 비밀번호 변경</span>
            <input name="adminPassword" type="password" minLength={4} />
          </label>
          <label>
            <span>공공데이터포털 서비스키</span>
            <input
              name="publicDataServiceKey"
              type="password"
              autoComplete="off"
              placeholder={config.publicDataServiceKeyStored ? "새 키 입력 시 교체" : "서비스키 입력"}
            />
            <small className="field-help">비워 두면 현재 학교별 키 또는 환경변수 기본값을 유지합니다.</small>
          </label>
          <PublicDataServiceKeyGuide />
          {config.publicDataServiceKeyStored ? (
            <label className="checkbox-label wide">
              <input type="checkbox" name="clearPublicDataServiceKey" value="true" />
              <span>저장된 학교별 서비스키 삭제</span>
            </label>
          ) : null}
          <div className="service-box wide">
            <span>공공데이터포털 키 상태</span>
            <strong>{publicDataServiceKeyStatus(config.publicDataServiceKeySource)}</strong>
            <small>학교별 키가 없으면 서버의 PUBLIC_DATA_SERVICE_KEY 환경변수를 사용합니다.</small>
          </div>
          <div className="service-box wide">
            <span>서비스 계정</span>
            <strong>{config.serviceAccountEmail || "환경변수 설정 필요"}</strong>
          </div>
          <GoogleServiceAccountGuide />
          <button type="submit" className="primary-button wide">
            설정 저장
          </button>
        </form>

        <section className="setup-panel admin-sections">
          <div className="form-grid">
            <label>
              <span>학년도</span>
              <input
                type="number"
                min="2000"
                max="2100"
                value={schoolYear}
                onChange={(event) => setSchoolYear(Number(event.target.value))}
              />
            </label>
            <div className="admin-actions wide">
              <button type="button" className="secondary-button" onClick={refreshHolidays}>
                공휴일 갱신
              </button>
              <button type="button" className="secondary-button" onClick={importLegacy}>
                기존 탭 가져오기
              </button>
            </div>
          </div>

          <form className="form-grid" onSubmit={saveHoliday}>
            <label>
              <span>휴일 날짜</span>
              <input type="date" required value={holiday.date} onChange={(event) => setHoliday({ ...holiday, date: event.target.value })} />
            </label>
            <label>
              <span>종류</span>
              <select value={holiday.type} onChange={(event) => setHoliday({ ...holiday, type: event.target.value })}>
                <option>재량휴업일</option>
                <option>개교기념일</option>
                <option>기관휴일</option>
                <option>공휴일</option>
              </select>
            </label>
            <label className="wide">
              <span>이름</span>
              <input required value={holiday.name} onChange={(event) => setHoliday({ ...holiday, name: event.target.value })} />
            </label>
            <label className="wide">
              <span>메모</span>
              <input value={holiday.memo} onChange={(event) => setHoliday({ ...holiday, memo: event.target.value })} />
            </label>
            <button type="submit" className="primary-button wide">
              휴일 저장
            </button>
          </form>
        </section>
      </section>
      <StatusBar status={status} error={error} />
    </main>
  );
}

function currentSchoolYear() {
  const now = new Date();
  return now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function publicDataServiceKeyStatus(source) {
  if (source === "school") return "학교별 서비스키 저장됨";
  if (source === "environment") return "환경변수 PUBLIC_DATA_SERVICE_KEY 사용 중";
  return "서비스키 미설정";
}
