"use client";

import { useEffect, useMemo, useState } from "react";

import { getMonthOptions } from "../lib/domain.js";
import { PasswordUnlock, safeFilename, StatusBar } from "./PlannerApp.jsx";
import { GoogleServiceAccountGuide, PublicDataServiceKeyGuide } from "./SetupGuides.jsx";

export default function SchoolAdminApp({ slug }) {
  const basePath = useMemo(() => `/api/schools/${encodeURIComponent(slug)}`, [slug]);
  const [config, setConfig] = useState(null);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [clearMonth, setClearMonth] = useState(new Date().getMonth() + 1);
  const [holiday, setHoliday] = useState({
    date: "",
    endDate: "",
    name: "",
    type: "재량휴업일",
    memo: "",
    includeWeekend: true,
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [lastImport, setLastImport] = useState(null);
  const monthOptions = getMonthOptions(schoolYear);

  useEffect(() => {
    loadConfig();
  }, [basePath]);

  async function loadConfig() {
    await request(`${basePath}/config`, { setData: setConfig, quiet: true });
  }

  async function request(url, { method = "GET", body, formData, setData, label, quiet = false } = {}) {
    setError("");
    if (!quiet) setStatus("처리 중입니다.");
    setBusy(true);
    try {
      const response = await fetch(
        url,
        formData
          ? {
              method,
              body: formData,
            }
          : {
              method,
              headers: { "Content-Type": "application/json" },
              body: body ? JSON.stringify(body) : undefined,
            },
      );
      const data = await response.json();
      if (!response.ok) {
        setStatus("");
        setError(data.error || "요청을 처리하지 못했습니다.");
        return null;
      }
      if (setData) setData(data);
      if (!quiet) setStatus(label || "완료되었습니다.");
      return data;
    } finally {
      setBusy(false);
    }
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

  async function backupData() {
    const data = await request(`${basePath}/backup`, { label: "자료를 백업했습니다." });
    if (!data) return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `${safeFilename(data.orgName || config.orgName)}-백업-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function restoreData(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setError("백업 파일을 읽을 수 없습니다. 자료 백업 버튼으로 내려받은 JSON 파일을 선택해 주세요.");
      return;
    }
    const summary = `일정 ${backup?.events?.length ?? 0}건, 휴일 ${backup?.holidays?.length ?? 0}건, 구분 ${backup?.categories?.length ?? 0}건`;
    const exported = backup?.exportedAt ? ` (${String(backup.exportedAt).slice(0, 10)} 백업)` : "";
    if (!window.confirm(`현재 자료를 모두 지우고 백업 내용으로 되돌립니다.\n${summary}${exported}\n계속할까요?`)) return;

    const data = await request(`${basePath}/restore`, {
      method: "POST",
      body: backup,
      label: "백업 자료로 복원했습니다.",
    });
    if (data) notifyPlannerChanged(slug);
  }

  async function importLegacy() {
    const data = await request(`${basePath}/import`, {
      method: "POST",
      body: { schoolYear },
      label: "기존 월별 탭을 가져왔습니다.",
    });
    if (data) {
      notifyPlannerChanged(slug);
      if (data.batchId) setLastImport({ batchId: data.batchId, count: data.count });
    }
  }

  async function previewWorkbook(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!file || !file.name) {
      setError("업로드할 엑셀 파일을 선택해 주세요.");
      return;
    }
    formData.set("schoolYear", String(schoolYear));
    const data = await request(`${basePath}/import`, {
      method: "POST",
      formData,
      quiet: true,
    });
    if (data) {
      setImportPreview(data);
      setPendingImportFile(file);
      const warningText = data.warnings?.length ? ` 검토 필요 ${data.warnings.length}건을 확인해 주세요.` : "";
      setStatus(`미리보기: ${data.count}개 일정을 찾았습니다.${warningText} 내용을 확인한 뒤 아래에서 반영하세요.`);
    }
  }

  function cancelImportPreview() {
    setImportPreview(null);
    setPendingImportFile(null);
    setStatus("");
  }

  async function confirmImportPreview() {
    if (!importPreview || !pendingImportFile) return;
    const formData = new FormData();
    formData.set("file", pendingImportFile);
    formData.set("schoolYear", String(schoolYear));
    formData.set("commit", "true");
    const data = await request(`${basePath}/import`, {
      method: "POST",
      formData,
      label: "엑셀 파일을 가져왔습니다.",
    });
    if (data) {
      setImportPreview(null);
      setPendingImportFile(null);
      notifyPlannerChanged(slug);
      if (data.batchId) setLastImport({ batchId: data.batchId, count: data.count });
      const warningText = data.warnings?.length ? ` 검토 필요 ${data.warnings.length}건이 있습니다.` : "";
      setStatus(`엑셀 파일에서 ${data.count}개 일정을 가져왔습니다.${warningText}`);
    }
  }

  async function undoLastImport() {
    if (!lastImport) return;
    if (!window.confirm(`방금 가져온 ${lastImport.count}건을 취소할까요?`)) return;
    const data = await request(`${basePath}/import/undo`, {
      method: "POST",
      body: { batchId: lastImport.batchId },
      label: "방금 가져온 일정을 취소했습니다.",
    });
    if (data) {
      setLastImport(null);
      notifyPlannerChanged(slug);
    }
  }

  async function saveHoliday(event) {
    event.preventDefault();
    const data = await request(`${basePath}/holidays`, {
      method: "POST",
      body: holiday,
      label: "휴일을 저장했습니다.",
    });
    if (data) setHoliday({ date: "", endDate: "", name: "", type: "재량휴업일", memo: "", includeWeekend: true });
  }

  async function clearEvents(scope) {
    const target = scope === "year" ? `${schoolYear}학년도 전체` : `${schoolYear}학년도 ${clearMonth}월`;
    if (!window.confirm(`${target} 행사를 모두 삭제할까요?`)) return;
    await request(`${basePath}/events/clear`, {
      method: "POST",
      body: { scope, schoolYear, month: clearMonth },
      label: `${target} 행사를 클리어했습니다.`,
    });
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

      <StatusBar status={status} error={error} />

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
          {config.authRequired ? (
            <label className="checkbox-label wide">
              <input type="checkbox" name="clearViewPassword" value="true" />
              <span>조회 비밀번호 없이 주소만으로 볼 수 있게 변경</span>
            </label>
          ) : null}
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
          <button type="submit" className="primary-button wide" disabled={busy}>
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
              <button type="button" className="secondary-button" onClick={backupData} disabled={busy}>
                자료 백업
              </button>
              <label className={`secondary-button file-button${busy ? " disabled" : ""}`}>
                자료 복원
                <input type="file" accept=".json,application/json" onChange={restoreData} disabled={busy} hidden />
              </label>
              <button type="button" className="secondary-button" onClick={refreshHolidays} disabled={busy}>
                공휴일 갱신
              </button>
              <button type="button" className="secondary-button" onClick={importLegacy} disabled={busy}>
                기존 탭 가져오기
              </button>
            </div>
            {lastImport ? (
              <div className="import-undo-banner wide">
                <span>방금 {lastImport.count}건을 가져왔습니다.</span>
                <button type="button" className="ghost-button" onClick={undoLastImport} disabled={busy}>
                  가져오기 취소
                </button>
              </div>
            ) : null}
          </div>

          <div className="form-grid">
            <label>
              <span>클리어할 월</span>
              <select value={clearMonth} onChange={(event) => setClearMonth(Number(event.target.value))}>
                {monthOptions.map((option) => (
                  <option key={option.key} value={option.month}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-actions wide">
              <button type="button" className="danger-button" onClick={() => clearEvents("month")} disabled={busy}>
                월별 행사 클리어
              </button>
              <button type="button" className="danger-button" onClick={() => clearEvents("year")} disabled={busy}>
                학년도 행사 클리어
              </button>
            </div>
          </div>

          <form className="form-grid" onSubmit={previewWorkbook}>
            <label className="wide">
              <span>월별 행사계획 엑셀 업로드</span>
              <input name="file" type="file" accept=".xlsx,.xlsm" required disabled={busy} />
              <small className="field-help">
                월별 시트(3월~2월)의 일, 요일, 구분, 시 간, 일 정 제 목, 장 소, 담당자 열을 읽어 옵니다. 미리보기에서 내용을 확인한 뒤 반영하며, 같은
                파일을 다시 올리면 중복 추가될 수 있으니 확정 전에 검토해 주세요.
              </small>
            </label>
            <button type="submit" className="secondary-button wide" disabled={busy}>
              미리보기
            </button>
          </form>

          {importPreview ? (
            <div className="import-preview wide">
              <header>
                <strong>미리보기: {importPreview.count}건</strong>
                <span>시트 {importPreview.sheets?.join(", ") || "-"}</span>
              </header>
              {importPreview.warnings?.length ? (
                <details className="import-warning-list" open>
                  <summary>검토 필요 {importPreview.warnings.length}건</summary>
                  <ul>
                    {importPreview.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="field-help">검토가 필요한 항목이 없습니다.</p>
              )}
              <div className="admin-actions wide">
                <button type="button" className="ghost-button" onClick={cancelImportPreview} disabled={busy}>
                  취소
                </button>
                <button type="button" className="primary-button" onClick={confirmImportPreview} disabled={busy}>
                  이 내용으로 반영
                </button>
              </div>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={saveHoliday}>
            <label>
              <span>휴일 날짜</span>
              <input
                type="date"
                required
                value={holiday.date}
                onChange={(event) => {
                  const date = event.target.value;
                  setHoliday({ ...holiday, date, endDate: holiday.endDate || date });
                }}
              />
            </label>
            <label>
              <span>종료일</span>
              <input
                type="date"
                min={holiday.date || undefined}
                value={holiday.endDate}
                onChange={(event) => setHoliday({ ...holiday, endDate: event.target.value })}
              />
            </label>
            <label className="checkbox-label wide">
              <input
                type="checkbox"
                checked={holiday.includeWeekend}
                onChange={(event) => setHoliday({ ...holiday, includeWeekend: event.target.checked })}
              />
              <span>연이은 날짜에 주말 포함 (체크 해제 시 이 휴일은 인접한 주말과 묶어서 "N일 연휴"로 표시하지 않습니다)</span>
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
            <button type="submit" className="primary-button wide" disabled={busy}>
              휴일 저장
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function currentSchoolYear() {
  const now = new Date();
  return now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function notifyPlannerChanged(slug) {
  try {
    window.localStorage.setItem(plannerChangedKey(slug), String(Date.now()));
  } catch {
    // 다른 탭 갱신 신호가 막혀도 업로드 저장은 그대로 유지합니다.
  }
}

function plannerChangedKey(slug) {
  return `planner-events-updated:${slug}`;
}

function publicDataServiceKeyStatus(source) {
  if (source === "school") return "학교별 서비스키 저장됨";
  if (source === "environment") return "환경변수 PUBLIC_DATA_SERVICE_KEY 사용 중";
  return "서비스키 미설정";
}
