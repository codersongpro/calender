"use client";

import { useEffect, useMemo, useState } from "react";

import { buildMonthCsv, EVENT_CATEGORY_OPTIONS, getMonthOptions, getPrintRowCount } from "../lib/domain.js";

const blankEvent = {
  date: "",
  endDate: "",
  category: "행사",
  time: "",
  title: "",
  place: "",
  owner: "",
};

export default function PlannerApp({ slug }) {
  const basePath = useMemo(() => `/api/schools/${encodeURIComponent(slug)}`, [slug]);
  const [config, setConfig] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [eventDraft, setEventDraft] = useState(blankEvent);
  const [editingEventId, setEditingEventId] = useState("");
  const [showEventForm, setShowEventForm] = useState(false);
  const monthOptions = monthData?.monthOptions?.length ? monthData.monthOptions : getMonthOptions(schoolYear);

  useEffect(() => {
    loadConfig();
  }, [basePath]);

  useEffect(() => {
    if (config?.authenticated) loadMonth();
  }, [config?.authenticated, schoolYear, month]);

  async function loadConfig() {
    await request(`${basePath}/config`, { setData: setConfig, label: "설정을 불러왔습니다.", quiet: true });
  }

  async function loadMonth() {
    await request(`${basePath}/month?schoolYear=${schoolYear}&month=${month}`, {
      setData: (data) => {
        setMonthData(data);
        if (data.month !== month) setMonth(data.month);
      },
      label: "월별 계획을 불러왔습니다.",
      quiet: true,
    });
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

  function changeSchoolYear(amount) {
    setSchoolYear((value) => Number(value || currentSchoolYear()) + amount);
  }

  async function unlock(scope, password) {
    const data = await request(`${basePath}/auth/${scope}`, {
      method: "POST",
      body: { password },
      label: scope === "edit" ? "편집 권한이 열렸습니다." : "조회 권한이 열렸습니다.",
    });
    if (!data?.authenticated) return;
    await loadConfig();
    await loadMonth();
  }

  function beginCreate(date = "") {
    if (!config?.canEdit) return;
    setEditingEventId("");
    setEventDraft({ ...blankEvent, date, endDate: date });
    setShowEventForm(true);
  }

  function beginEdit(event) {
    if (!config?.canEdit) return;
    setEditingEventId(event.id);
    setEventDraft({
      date: event.date,
      endDate: event.endDate || "",
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
    const url = editingEventId ? `${basePath}/events/${editingEventId}` : `${basePath}/events`;
    const method = editingEventId ? "PATCH" : "POST";
    const data = await request(url, {
      method,
      body: eventDraft,
      label: editingEventId ? "행사를 수정했습니다." : "행사를 추가했습니다.",
    });
    if (data) {
      setShowEventForm(false);
      await loadConfig();
      await loadMonth();
    }
  }

  async function deleteCurrentEvent() {
    if (!editingEventId) return;
    const data = await request(`${basePath}/events/${editingEventId}`, {
      method: "DELETE",
      label: "행사를 삭제했습니다.",
    });
    if (data) {
      setShowEventForm(false);
      await loadMonth();
    }
  }

  function downloadMonthCsv() {
    if (!monthData) return;
    const csv = `\ufeff${buildMonthCsv({ ...monthData, schoolYear })}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(monthData.config?.orgName || config.orgName)}-${schoolYear}-${String(monthData.month).padStart(2, "0")}월-행사계획.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!config) return <div className="loading">불러오는 중</div>;

  if (!config.exists) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <p className="eyebrow">학교 사이트</p>
          <h1>등록되지 않은 주소입니다.</h1>
        </section>
      </main>
    );
  }

  if (config.status === "suspended") {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <p className="eyebrow">학교 사이트</p>
          <h1>현재 사용이 중지되었습니다.</h1>
        </section>
      </main>
    );
  }

  if (!config.authenticated) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <div className="setup-heading">
            <p className="eyebrow">내부 조회</p>
            <h1>조회 비밀번호를 입력해 주세요.</h1>
          </div>
          <PasswordUnlock label="조회 비밀번호" buttonLabel="열기" onSubmit={(password) => unlock("view", password)} />
          <StatusBar status={status} error={error} />
        </section>
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
          <button type="button" className="ghost-button" onClick={downloadMonthCsv} disabled={!monthData}>
            다운로드
          </button>
          {config.canEdit ? (
            <button type="button" className="primary-button" onClick={() => beginCreate()}>
              행사 추가
            </button>
          ) : null}
          <a className="secondary-link" href={`/s/${encodeURIComponent(slug)}/admin`}>
            학교 관리
          </a>
        </div>
      </header>

      <section className="control-band">
        <div className="year-stepper">
          <button type="button" className="secondary-button year-nav-button" onClick={() => changeSchoolYear(-1)}>
            이전
          </button>
          <label>
            <span>학년도</span>
            <input
              type="number"
              value={schoolYear}
              onChange={(event) => setSchoolYear(Number(event.target.value))}
            />
          </label>
          <button type="button" className="secondary-button year-nav-button" onClick={() => changeSchoolYear(1)}>
            다음
          </button>
        </div>
        <label>
          <span>월</span>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {monthOptions.map((option) => (
              <option key={option.key} value={option.month}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {!config.canEdit ? (
          <PasswordUnlock label="편집 비밀번호" buttonLabel="편집 열기" onSubmit={(password) => unlock("edit", password)} />
        ) : null}
      </section>

      <StatusBar status={status} error={error} />

      {monthData ? (
        <section className="print-surface">
          <div className="print-title">
            <h2>[{monthData.month}월중 행사 계획]</h2>
            <p>{schoolYear}학년도</p>
          </div>
          <PlannerTable monthData={monthData} onEdit={beginEdit} onCreate={beginCreate} canEdit={Boolean(config.canEdit)} />
          <MobileCards monthData={monthData} onEdit={beginEdit} onCreate={beginCreate} canEdit={Boolean(config.canEdit)} />
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
    </main>
  );
}

function PlannerTable({ monthData, onEdit, onCreate, canEdit }) {
  const printRowCount = getPrintRowCount(monthData);

  return (
    <table className="planner-table" style={{ "--print-row-count": String(printRowCount) }}>
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
            {canEdit ? (
              <button type="button" onClick={() => onCreate(day.date)} className="small-button">
                추가
              </button>
            ) : null}
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
  const categoryChoice = EVENT_CATEGORY_OPTIONS.includes(draft.category) ? draft.category : "(직접입력)";
  const directCategory = categoryChoice === "(직접입력)";

  return (
    <div className="dialog-backdrop">
      <section className="dialog">
        <header>
          <h2>{editing ? "행사 수정" : "행사 추가"}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            x
          </button>
        </header>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            <span>시작일</span>
            <input
              type="date"
              value={draft.date}
              required
              onChange={(event) => {
                const date = event.target.value;
                setDraft({ ...draft, date, endDate: draft.endDate || date });
              }}
            />
          </label>
          <label>
            <span>종료일(선택)</span>
            <input
              type="date"
              min={draft.date || undefined}
              value={draft.endDate || ""}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
            />
          </label>
          <label>
            <span>구분</span>
            <select
              value={categoryChoice}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setDraft({ ...draft, category: nextCategory === "(직접입력)" ? "" : nextCategory });
              }}
            >
              {EVENT_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {directCategory ? (
            <label>
              <span>구분 직접입력</span>
              <input
                list="category-list"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                placeholder="구분 입력"
              />
              <datalist id="category-list">
                {categories.map((category) => (
                  <option key={category.name} value={category.name} />
                ))}
              </datalist>
            </label>
          ) : null}
          <label>
            <span>시간</span>
            <input
              type="time"
              step="60"
              value={draft.time}
              onChange={(event) => setDraft({ ...draft, time: event.target.value })}
            />
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

export function PasswordUnlock({ label, buttonLabel = "확인", onSubmit }) {
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
        {buttonLabel}
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

export function StatusBar({ status, error }) {
  if (!status && !error) return null;
  return <div className={error ? "status error" : "status"}>{error || status}</div>;
}

function dayClass(day) {
  if (day.holidays?.length) return "holiday-row";
  if (day.isSunday) return "sunday-row";
  if (day.isSaturday) return "saturday-row";
  return "";
}

function currentSchoolYear() {
  const now = new Date();
  return now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function safeFilename(value) {
  return String(value ?? "월별행사계획")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ") || "월별행사계획";
}
