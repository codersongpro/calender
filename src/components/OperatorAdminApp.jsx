"use client";

import { useEffect, useState } from "react";

import { PasswordUnlock, StatusBar } from "./PlannerApp.jsx";

export default function OperatorAdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [createdUrls, setCreatedUrls] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadTenants({ quiet: true });
  }, []);

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
      if (response.status === 401) setAuthenticated(false);
      return null;
    }
    setAuthenticated(true);
    if (setData) setData(data);
    if (!quiet) setStatus(label || "완료되었습니다.");
    return data;
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
    const viewPassword = window.prompt("새 조회 비밀번호");
    if (viewPassword === null) return;
    const editPassword = window.prompt("새 편집 비밀번호");
    if (editPassword === null) return;
    const adminPassword = window.prompt("새 관리 비밀번호");
    if (adminPassword === null) return;
    const data = await request(`/api/operator/tenants/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: { viewPassword, editPassword, adminPassword },
      label: "학교 비밀번호를 재설정했습니다.",
    });
    if (data) await loadTenants();
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
          <label>
            <span>조회 비밀번호</span>
            <input name="viewPassword" type="password" required minLength={4} />
          </label>
          <label>
            <span>편집 비밀번호</span>
            <input name="editPassword" type="password" required minLength={4} />
          </label>
          <label>
            <span>관리 비밀번호</span>
            <input name="adminPassword" type="password" required minLength={4} />
          </label>
          <label>
            <span>공공데이터포털 서비스키</span>
            <input name="publicDataServiceKey" />
          </label>
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
