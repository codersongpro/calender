"use client";

import { useEffect, useState } from "react";

import { PasswordUnlock, StatusBar } from "./PlannerApp.jsx";
import { GoogleServiceAccountGuide, PublicDataServiceKeyGuide } from "./SetupGuides.jsx";

export default function OperatorAdminApp() {
  const [operatorReady, setOperatorReady] = useState(null);
  const [operatorLoadFailed, setOperatorLoadFailed] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [createdUrls, setCreatedUrls] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadOperatorState();
  }, []);

  async function request(url, { method = "GET", body, setData, label, quiet = false, markAuthenticated = true } = {}) {
    setError("");
    if (!quiet) setStatus("처리 중입니다.");
    let response;
    let data;
    try {
      response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      data = await response.json();
    } catch {
      setStatus("");
      setError("관리 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return null;
    }
    if (!response.ok) {
      setStatus("");
      setError(data.error || "요청을 처리하지 못했습니다.");
      if (response.status === 401) setAuthenticated(false);
      return null;
    }
    if (markAuthenticated) setAuthenticated(true);
    if (setData) setData(data);
    if (!quiet) setStatus(label || "완료되었습니다.");
    return data;
  }

  async function loadOperatorState() {
    setOperatorLoadFailed(false);
    const data = await request("/api/operator/state", {
      setData: (state) => setOperatorReady(Boolean(state.setupComplete)),
      quiet: true,
      markAuthenticated: false,
    });
    if (!data) {
      setOperatorLoadFailed(true);
      return;
    }
    if (data?.setupComplete) await loadTenants({ quiet: true });
  }

  async function setupOperator(password) {
    const data = await request("/api/operator/setup", {
      method: "POST",
      body: { password },
      label: "메인 운영자 비밀번호를 설정했습니다.",
      markAuthenticated: false,
    });
    if (data?.setupComplete) {
      setOperatorReady(true);
      await login(password);
    }
  }

  async function login(password) {
    const data = await request("/api/operator/auth", {
      method: "POST",
      body: { password },
      label: "운영자 권한이 열렸습니다.",
    });
    if (data?.authenticated) await loadTenants();
  }

  async function loadTenants({ quiet = false } = {}) {
    await request(`/api/operator/tenants?search=${encodeURIComponent(search)}`, {
      setData: (data) => setTenants(data.tenants || []),
      label: "학교 목록을 불러왔습니다.",
      quiet,
    });
  }

  async function createTenant(event) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget).entries());
    const data = await request("/api/operator/tenants", {
      method: "POST",
      body: input,
      label: "학교 사이트를 생성했습니다.",
    });
    if (data) {
      setCreatedUrls(data.urls);
      event.currentTarget.reset();
      await loadTenants();
    }
  }

  async function setStatusFor(slug, nextStatus) {
    const data = await request(`/api/operator/tenants/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: { status: nextStatus },
      label: nextStatus === "active" ? "학교 사이트를 활성화했습니다." : "학교 사이트를 중지했습니다.",
    });
    if (data) await loadTenants();
  }

  async function checkSheet(slug) {
    await request(`/api/operator/tenants/${encodeURIComponent(slug)}/check`, {
      method: "POST",
      label: "스프레드시트 연결을 확인했습니다.",
    });
  }

  async function resetPasswords(slug) {
    const adminPassword = window.prompt("새 학교 운영자 비밀번호");
    if (adminPassword === null) return;
    const data = await request(`/api/operator/tenants/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: { adminPassword },
      label: "학교 비밀번호를 재설정했습니다.",
    });
    if (data) await loadTenants();
  }

  async function changeOperatorPassword(event) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget).entries());
    const data = await request("/api/operator/password", {
      method: "PATCH",
      body: { password: input.operatorPassword },
      label: "메인 운영자 비밀번호를 변경했습니다.",
    });
    if (data) event.currentTarget.reset();
  }

  if (operatorReady === null) {
    if (operatorLoadFailed) {
      return (
        <main className="setup-page">
          <section className="setup-panel">
            <div className="setup-heading">
              <p className="eyebrow">메인 관리</p>
              <h1>관리 상태를 불러오지 못했습니다.</h1>
            </div>
            <p className="page-copy">배포 환경 설정과 데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p>
            <button type="button" className="secondary-button" onClick={loadOperatorState}>
              다시 시도
            </button>
            <StatusBar status={status} error={error} />
          </section>
        </main>
      );
    }
    return <div className="loading">불러오는 중</div>;
  }

  if (!operatorReady) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <div className="setup-heading">
            <p className="eyebrow">메인 관리</p>
            <h1>처음 사용할 운영자 비밀번호를 설정해 주세요.</h1>
          </div>
          <PasswordUnlock label="새 운영자 비밀번호" buttonLabel="처음 설정" onSubmit={setupOperator} />
          <StatusBar status={status} error={error} />
        </section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <div className="setup-heading">
            <p className="eyebrow">메인 관리</p>
            <h1>운영자 비밀번호를 입력해 주세요.</h1>
          </div>
          <PasswordUnlock label="운영자 비밀번호" buttonLabel="관리 열기" onSubmit={login} />
          <StatusBar status={status} error={error} />
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">메인 관리</p>
          <h1>학교 사이트 관리</h1>
        </div>
      </header>

      <section className="operator-guide">
        <div>
          <p className="eyebrow">학교별 진행 순서</p>
          <h2>새 학교는 아래 순서대로 준비하면 됩니다.</h2>
        </div>
        <ol>
          <li>
            <strong>빈 스프레드시트 준비</strong>
            <span>학교별 Google Spreadsheet를 만들고 서비스 계정에 편집 권한을 줍니다.</span>
          </li>
          <li>
            <strong>학교 사이트 생성</strong>
            <span>기관명, 학교코드, 스프레드시트 주소, 학교 운영자 비밀번호를 입력합니다.</span>
          </li>
          <li>
            <strong>주소 전달</strong>
            <span>생성된 조회 주소는 교직원에게, 학교 관리 주소는 담당자에게 전달합니다.</span>
          </li>
          <li>
            <strong>학교 관리 설정</strong>
            <span>학교 관리 화면에서 공휴일을 갱신하고 필요하면 기존 월별 탭을 가져옵니다.</span>
          </li>
          <li>
            <strong>월별 계획 운영</strong>
            <span>주소를 아는 누구나 조회·편집할 수 있으며, 학교 설정은 학교 운영자 비밀번호로 보호됩니다.</span>
          </li>
        </ol>
      </section>

      <section className="admin-layout">
        <form className="setup-panel form-grid" onSubmit={createTenant}>
          <div className="setup-heading wide">
            <p className="eyebrow">새 학교 생성</p>
            <h2>학교별 주소와 관리 페이지를 발급합니다.</h2>
          </div>
          <label>
            <span>기관명</span>
            <input name="orgName" required placeholder="예: 가람초등학교" />
          </label>
          <label>
            <span>학교코드</span>
            <input name="slug" required placeholder="예: garam-es" />
          </label>
          <label className="wide">
            <span>빈 스프레드시트 주소</span>
            <input name="spreadsheetUrl" required placeholder="https://docs.google.com/spreadsheets/d/..." />
          </label>
          <GoogleServiceAccountGuide />
          <label>
            <span>학교 운영자 비밀번호</span>
            <input name="adminPassword" type="password" required minLength={4} />
          </label>
          <label>
            <span>공공데이터포털 서비스키</span>
            <input name="publicDataServiceKey" type="password" autoComplete="off" placeholder="선택 입력" />
            <small className="field-help">비워 두면 PUBLIC_DATA_SERVICE_KEY 환경변수를 기본값으로 사용합니다.</small>
          </label>
          <PublicDataServiceKeyGuide saveLabel="학교 사이트 생성" refreshText="학교 관리 화면의 공휴일 갱신" />
          <button type="submit" className="primary-button wide">
            학교 사이트 생성
          </button>
          {createdUrls ? (
            <div className="service-box wide">
              <span>생성된 주소</span>
              <strong>
                <a href={createdUrls.site}>{createdUrls.site}</a>
                <br />
                <a href={createdUrls.admin}>{createdUrls.admin}</a>
              </strong>
            </div>
          ) : null}
        </form>

        <section className="setup-panel admin-sections">
          <form className="form-grid" onSubmit={changeOperatorPassword}>
            <div className="setup-heading wide">
              <p className="eyebrow">메인 운영자</p>
              <h2>운영자 비밀번호 변경</h2>
            </div>
            <label className="wide">
              <span>새 운영자 비밀번호</span>
              <input name="operatorPassword" type="password" required minLength={4} />
            </label>
            <button type="submit" className="secondary-button wide">
              운영자 비밀번호 저장
            </button>
          </form>
          <div className="inline-unlock">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="기관명 또는 학교코드 검색" />
            <button type="button" className="secondary-button" onClick={() => loadTenants()}>
              검색
            </button>
          </div>
          <div className="tenant-table-wrap">
            <table className="tenant-table">
              <thead>
                <tr>
                  <th>기관명</th>
                  <th>학교코드</th>
                  <th>상태</th>
                  <th>주소</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>{tenant.orgName}</td>
                    <td>{tenant.slug}</td>
                    <td>{tenant.status === "active" ? "사용 중" : "중지"}</td>
                    <td>
                      <a href={`/s/${encodeURIComponent(tenant.slug)}`}>조회</a>
                      {" / "}
                      <a href={`/s/${encodeURIComponent(tenant.slug)}/admin`}>학교 관리</a>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" className="secondary-button" onClick={() => checkSheet(tenant.slug)}>
                          점검
                        </button>
                        <button type="button" className="secondary-button" onClick={() => resetPasswords(tenant.slug)}>
                          비번 재설정
                        </button>
                        {tenant.status === "active" ? (
                          <button type="button" className="danger-button" onClick={() => setStatusFor(tenant.slug, "suspended")}>
                            중지
                          </button>
                        ) : (
                          <button type="button" className="primary-button" onClick={() => setStatusFor(tenant.slug, "active")}>
                            활성화
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <StatusBar status={status} error={error} />
    </main>
  );
}
