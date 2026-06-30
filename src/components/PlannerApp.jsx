"use client";

import { useEffect, useMemo, useState } from "react";

const blankEvent = {
  date: "",
  category: "행사",
  time: "",
  title: "",
  place: "",
  owner: "",
};

export default function PlannerApp() {
  const [config, setConfig] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [schoolYear, setSchoolYear] = useState(new Date().getMonth() + 1 >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editToken, setEditToken] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [eventDraft, setEventDraft] = useState(blankEvent);
  const [editingEventId, setEditingEventId] = useState("");
  const [showEventForm, setShowEventForm] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    setEditToken(localStorage.getItem("editToken") || "");
    setAdminToken(localStorage.getItem("adminToken") || "");
    loadConfig();
  }, []);

  useEffect(() => {
    if (config?.setupComplete) loadMonth();
  }, [config?.setupComplete, schoolYear, month]);

  useEffect(() => {
    const beforePrint = () => {
      const surface = document.querySelector(".print-surface");
      if (!surface) return;
      const availableHeight = 1040;
      const scale = Math.min(1, Math.max(0.72, availableHeight / surface.scrollHeight));
      document.documentElement.style.setProperty("--print-scale", String(scale));
    };
    window.addEventListener("beforeprint", beforePrint);
    return () => window.removeEventListener("beforeprint", beforePrint);
  }, []);

  async function loadConfig() {
    await request("/api/config", { setData: setConfig, label: "설정을 불러왔습니다." });
  }

  async function loadMonth() {
    await request(`/api/month?schoolYear=${schoolYear}&month=${month}`, {
      setData: (data) => {
        setMonthData(data);
        if (data.month !== month) setMonth(data.month);
      },
      label: "월별 계획을 불러왔습니다.",
      quiet: true,
    });
  }

  async function request(url, { method = "GET", body, token, setData, label, quiet = false } = {}) {
    setError("");
    if (!quiet) setStatus("처리 중입니다.");
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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

  async function handleSetup(formData) {
    const input = Object.fromEntries(formData.entries());
    const data = await request("/api/config", {
      method: "POST",
      body: input,
      token: adminToken,
      label: "설정이 저장되었습니다.",
    });
    if (data) setConfig(data);
  }

  async function unlock(scope, password) {
    const data = await request(`/api/auth/${scope}`, {
      method: "POST",
      body: { password },
      label: scope === "admin" ? "관리 권한이 열렸습니다." : "편집 권한이 열렸습니다.",
    });
    if (!data?.token) return;
    if (scope === "admin") {
      setAdminToken(data.token);
      localStorage.setItem("adminToken", data.token);
    } else {
      setEditToken(data.token);
      localStorage.setItem("editToken", data.token);
    }
  }

  function beginCreate(date = "") {
    setEditingEventId("");
    setEventDraft({ ...blankEvent, date });
    setShowEventForm(true);
  }

  function beginEdit(event) {
    setEditingEventId(event.id);
    setEventDraft({
      date: event.date,
      category: event.category,
      time: event.time,
      title: event.title,
      place: event.place,
      owner: event.owner,
      sortOrder: event.sortOrder,
    });
    setShowEventForm(true);
  }

  async function submitEvent(event) {
    event.preventDefault();
    const url = editingEventId ? `/api/events/${editingEventId}` : "/api/events";
    const method = editingEventId ? "PATCH" : "POST";
    const data = await request(url, {
      method,
      body: eventDraft,
      token: editToken,
      label: editingEventId ? "행사를 수정했습니다." : "행사를 추가했습니다.",
    });
    if (data) {
      setShowEventForm(false);
      await loadMonth();
    }
  }

  async function deleteCurrentEvent() {
    if (!editingEventId) return;
    const data = await request(`/api/events/${editingEventId}`, {
      method: "DELETE",
      token: editToken,
      label: "행사를 삭제했습니다.",
    });
    if (data) {
      setShowEventForm(false);
      await loadMonth();
    }
  }

  if (!config) {
    return <div className="loading">불러오는 중</div>;
  }

  if (!config.setupComplete) {
    return (
      <main className="setup-page">
        <SetupPanel config={config} onSubmit={handleSetup} />
        <StatusBar status={status} error={error} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">월별 행사계획</p>
          <h1>{monthData?.config?.orgName || config.orgName}</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost-button" onClick={() => window.print()}>
            인쇄
          </button>
          <button type="button" className="primary-button" onClick={() => beginCreate()}>
            행사 추가
          </button>
          <button type="button" className="secondary-button" onClick={() => setShowAdmin(true)}>
            관리
          </button>
        </div>
      </header>

      <section className="control-band">
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
        <label>
          <span>월</span>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {(monthData?.monthOptions || []).map((option) => (
              <option key={option.key} value={option.month}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {!editToken ? <PasswordUnlock label="편집 잠금 해제" onSubmit={(password) => unlock("edit", password)} /> : null}
      </section>

      <StatusBar status={status} error={error} />

      {monthData ? (
        <section className="print-surface">
          <div className="print-title">
            <h2>
              [{monthData.month}월중 행사 계획]
            </h2>
            <p>{schoolYear}학년도</p>
          </div>
          <PlannerTable monthData={monthData} onEdit={beginEdit} onCreate={beginCreate} canEdit={Boolean(editToken)} />
          <MobileCards monthData={monthData} onEdit={beginEdit} onCreate={beginCreate} canEdit={Boolean(editToken)} />
        </section>
      ) : (
        <div className="loading">월별 계획을 불러오는 중</div>
      )}

      {showEventForm ? (
        <EventDialog
          draft={eventDraft}
          setDraft={setEventDraft}
          categories={monthData?.categories || []}
          editing={Boolean(editingEventId)}
          canDelete={Boolean(editingEventId)}
          onSubmit={submitEvent}
          onDelete={deleteCurrentEvent}
          onClose={() => setShowEventForm(false)}
        />
      ) : null}

      {showAdmin ? (
        <AdminDialog
          config={config}
          adminToken={adminToken}
          schoolYear={schoolYear}
          onUnlock={(password) => unlock("admin", password)}
          onClose={() => setShowAdmin(false)}
          onSetup={handleSetup}
          onRequest={request}
          onReload={async () => {
            await loadConfig();
            await loadMonth();
          }}
        />
      ) : null}
    </main>
  );
}

function SetupPanel({ config, onSubmit }) {
  return (
    <section className="setup-panel">
      <div className="setup-heading">
        <p className="eyebrow">초기 설정</p>
        <h1>월별 행사계획</h1>
      </div>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <label>
          <span>기관명</span>
          <input name="orgName" required placeholder="예: 학성초등학교" />
        </label>
        <label>
          <span>구글 스프레드시트 주소</span>
          <input name="spreadsheetUrl" required placeholder="https://docs.google.com/spreadsheets/d/..." />
        </label>
        <label>
          <span>편집 비밀번호</span>
          <input name="editPassword" type="password" required minLength={4} />
        </label>
        <label>
          <span>관리 비밀번호</span>
          <input name="adminPassword" type="password" required minLength={4} />
        </label>
        <label className="wide">
          <span>공공데이터포털 서비스키</span>
          <input name="publicDataServiceKey" />
        </label>
        <div className="service-box wide">
          <span>서비스 계정</span>
          <strong>{config.serviceAccountEmail || "환경변수 설정 필요"}</strong>
        </div>
        <button type="submit" className="primary-button wide">
          저장
        </button>
      </form>
    </section>
  );
}

function PlannerTable({ monthData, onEdit, onCreate, canEdit }) {
  return (
    <table className="planner-table">
      <thead>
        <tr>
          <th>일</th>
          <th>요일</th>
          <th>구분</th>
          <th>시간</th>
          <th>일정 제목</th>
          <th>장소</th>
          <th>담당자</th>
        </tr>
      </thead>
      <tbody>
        {monthData.days.map((day) => {
          const events = day.events.length ? day.events : [null];
          return events.map((event, index) => (
            <tr key={`${day.date}-${event?.id || "blank"}-${index}`} className={dayClass(day)}>
              {index === 0 ? (
                <>
                  <td rowSpan={events.length} className="date-cell">
                    <button type="button" onClick={() => canEdit && onCreate(day.date)} className="date-button">
                      {day.day}
                    </button>
                  </td>
                  <td rowSpan={events.length}>{day.weekday}</td>
                </>
              ) : null}
              <td>{event ? <CategoryPill value={event.category} categories={monthData.categories} /> : ""}</td>
              <td className="time-cell">{event?.time || ""}</td>
              <td className="title-cell">
                {index === 0 ? <HolidayLine day={day} /> : null}
                {event ? (
                  <button type="button" className="event-title" onClick={() => canEdit && onEdit(event)}>
                    {event.title}
                  </button>
                ) : null}
              </td>
              <td>{event?.place || ""}</td>
              <td>{event?.owner || ""}</td>
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}

function MobileCards({ monthData, onEdit, onCreate, canEdit }) {
  return (
    <div className="mobile-cards">
      {monthData.days.map((day) => (
        <article key={day.date} className={`day-card ${dayClass(day)}`}>
          <header>
            <div>
              <strong>{day.day}</strong>
              <span>{day.weekday}</span>
            </div>
            <button type="button" onClick={() => canEdit && onCreate(day.date)} className="small-button">
              추가
            </button>
          </header>
          <HolidayLine day={day} />
          {day.events.length ? (
            day.events.map((event) => (
              <button key={event.id} type="button" className="mobile-event" onClick={() => canEdit && onEdit(event)}>
                <span>
                  <CategoryPill value={event.category} categories={monthData.categories} />
                  {event.time ? <em>{event.time}</em> : null}
                </span>
                <strong>{event.title}</strong>
                <small>{[event.place, event.owner].filter(Boolean).join(" · ")}</small>
              </button>
            ))
          ) : (
            <p className="empty-day">등록된 일정 없음</p>
          )}
        </article>
      ))}
    </div>
  );
}

function EventDialog({ draft, setDraft, categories, editing, canDelete, onSubmit, onDelete, onClose }) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog">
        <header>
          <h2>{editing ? "행사 수정" : "행사 추가"}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            <span>날짜</span>
            <input type="date" value={draft.date} required onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
          </label>
          <label>
            <span>구분</span>
            <input list="category-list" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
            <datalist id="category-list">
              {categories.map((category) => (
                <option key={category.name} value={category.name} />
              ))}
            </datalist>
          </label>
          <label>
            <span>시간</span>
            <input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} placeholder="09:00~10:00" />
          </label>
          <label>
            <span>담당자</span>
            <input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
          </label>
          <label className="wide">
            <span>일정 제목</span>
            <input value={draft.title} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="wide">
            <span>장소</span>
            <input value={draft.place} onChange={(event) => setDraft({ ...draft, place: event.target.value })} />
          </label>
          <div className="dialog-actions wide">
            {canDelete ? (
              <button type="button" className="danger-button" onClick={onDelete}>
                삭제
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="primary-button">
              저장
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdminDialog({ config, adminToken, schoolYear, onUnlock, onClose, onSetup, onRequest, onReload }) {
  const [holiday, setHoliday] = useState({ date: "", name: "", type: "재량휴업일", memo: "" });
  const [password, setPassword] = useState("");

  async function refreshHolidays() {
    const data = await onRequest("/api/holidays/refresh", {
      method: "POST",
      token: adminToken,
      body: { schoolYear },
      label: "공휴일을 갱신했습니다.",
    });
    if (data) await onReload();
  }

  async function importLegacy() {
    const data = await onRequest("/api/import", {
      method: "POST",
      token: adminToken,
      body: { schoolYear },
      label: "기존 월별 탭을 가져왔습니다.",
    });
    if (data) await onReload();
  }

  async function saveHoliday(event) {
    event.preventDefault();
    const data = await onRequest("/api/holidays", {
      method: "POST",
      token: adminToken,
      body: holiday,
      label: "휴일을 저장했습니다.",
    });
    if (data) {
      setHoliday({ date: "", name: "", type: "재량휴업일", memo: "" });
      await onReload();
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="dialog admin-dialog">
        <header>
          <h2>관리</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        {!adminToken ? (
          <form
            className="inline-unlock"
            onSubmit={(event) => {
              event.preventDefault();
              onUnlock(password);
            }}
          >
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="관리 비밀번호" />
            <button type="submit" className="primary-button">
              확인
            </button>
          </form>
        ) : (
          <div className="admin-sections">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                onSetup(new FormData(event.currentTarget));
              }}
            >
              <label>
                <span>기관명</span>
                <input name="orgName" defaultValue={config.orgName} required />
              </label>
              <label>
                <span>스프레드시트 주소</span>
                <input name="spreadsheetUrl" defaultValue={config.spreadsheetId} required />
              </label>
              <label>
                <span>편집 비밀번호 변경</span>
                <input name="editPassword" type="password" minLength={4} />
              </label>
              <label>
                <span>관리 비밀번호 변경</span>
                <input name="adminPassword" type="password" minLength={4} />
              </label>
              <label className="wide">
                <span>공공데이터포털 서비스키</span>
                <input name="publicDataServiceKey" />
              </label>
              <button type="submit" className="secondary-button wide">
                설정 저장
              </button>
            </form>
            <div className="admin-actions">
              <button type="button" className="secondary-button" onClick={refreshHolidays}>
                공휴일 갱신
              </button>
              <button type="button" className="secondary-button" onClick={importLegacy}>
                기존 탭 가져오기
              </button>
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
          </div>
        )}
      </section>
    </div>
  );
}

function PasswordUnlock({ label, onSubmit }) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="inline-unlock"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(password);
        setPassword("");
      }}
    >
      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={label} />
      <button type="submit" className="secondary-button">
        확인
      </button>
    </form>
  );
}

function CategoryPill({ value, categories }) {
  if (!value) return null;
  const category = categories.find((item) => item.name === value);
  return (
    <span className="category-pill" style={{ "--pill": category?.color || "#475569" }}>
      {value}
    </span>
  );
}

function HolidayLine({ day }) {
  const names = day.holidays?.map((holiday) => holiday.name).filter(Boolean) || [];
  if (day.holidayCluster && !names.includes(`${day.holidayCluster.days}일 연휴`)) {
    names.push(`${day.holidayCluster.days}일 연휴`);
  }
  if (!names.length) return null;
  return (
    <div className="holiday-line">
      {names.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
}

function StatusBar({ status, error }) {
  if (!status && !error) return null;
  return <div className={error ? "status error" : "status"}>{error || status}</div>;
}

function dayClass(day) {
  if (day.holidays?.length) return "holiday-row";
  if (day.isSunday) return "sunday-row";
  if (day.isSaturday) return "saturday-row";
  return "";
}
