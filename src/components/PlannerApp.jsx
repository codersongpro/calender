"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildMonthCsv,
  EVENT_CATEGORY_OPTIONS,
  getMonthOptions,
  getRowCountForDays,
  normalizeBoolean,
  splitDaysForPrint,
} from "../lib/domain.js";

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
  const [printPages, setPrintPages] = useState(1);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const monthOptions = monthData?.monthOptions?.length ? monthData.monthOptions : getMonthOptions(schoolYear);
  const printPageGroups = monthData ? splitDaysForPrint(monthData.days, printPages) : [];

  useEffect(() => {
    loadConfig();
  }, [basePath]);

  useEffect(() => {
    const manifestUrl = `${basePath}/manifest`;
    const manifestLink = document.querySelector('link[rel="manifest"]') || document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = manifestUrl;
    if (!manifestLink.isConnected) document.head.appendChild(manifestLink);

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = "/apple-touch-icon.png";
    if (!appleIcon.isConnected) document.head.appendChild(appleIcon);

    const themeColor = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = "#1d6f8f";
    if (!themeColor.isConnected) document.head.appendChild(themeColor);

    const appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]') || document.createElement("meta");
    appleCapable.name = "apple-mobile-web-app-capable";
    appleCapable.content = "yes";
    if (!appleCapable.isConnected) document.head.appendChild(appleCapable);
  }, [basePath]);

  useEffect(() => {
    const orgName = monthData?.config?.orgName || config?.orgName;
    if (!orgName) return;
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') || document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    appleTitle.content = orgName;
    if (!appleTitle.isConnected) document.head.appendChild(appleTitle);
  }, [monthData?.config?.orgName, config?.orgName]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Add-to-home-screen still works without the service worker on most
      // browsers; ignore registration failures (e.g. running over plain HTTP
      // in local dev).
    });
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    function handleAppInstalled() {
      setInstallPrompt(null);
      setInstalled(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function addShortcut() {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  useEffect(() => {
    if (config?.authenticated) loadMonth();
  }, [config?.authenticated, schoolYear, month]);

  useEffect(() => {
    if (!config?.authenticated) return;
    function handlePlannerChanged(event) {
      if (event.key === plannerChangedKey(slug)) loadMonth();
    }
    window.addEventListener("storage", handlePlannerChanged);
    return () => window.removeEventListener("storage", handlePlannerChanged);
  }, [config?.authenticated, slug, schoolYear, month]);

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

  async function dismissReview(event) {
    const data = await request(`${basePath}/events/${event.id}`, {
      method: "PATCH",
      body: { reviewNeeded: "" },
      quiet: true,
    });
    if (data) await loadMonth();
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
          {!installed ? (
            <button type="button" className="ghost-button" onClick={addShortcut}>
              바로가기 추가
            </button>
          ) : null}
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
        <label>
          <span>인쇄 용지</span>
          <select value={printPages} onChange={(event) => setPrintPages(Number(event.target.value))}>
            <option value={1}>1페이지에 맞추기</option>
            <option value={2}>2페이지로 나누기</option>
          </select>
        </label>
      </section>

      <StatusBar status={status} error={error} />

      {monthData ? (
        <>
          {printPageGroups.map((pageDays, index) => (
            <section key={index} className={`print-surface${index < printPageGroups.length - 1 ? " print-page-break" : ""}`}>
              <div className="print-title">
                <h2>[{monthData.month}월중 행사 계획]</h2>
                <p>
                  {schoolYear}학년도
                  {printPageGroups.length > 1 ? ` · ${index + 1}/${printPageGroups.length}페이지` : ""}
                </p>
              </div>
              <PlannerTable
                days={pageDays}
                categories={monthData.categories}
                onEdit={beginEdit}
                onCreate={beginCreate}
                onDismissReview={dismissReview}
                canEdit={Boolean(config.canEdit)}
              />
            </section>
          ))}
          <MobileCards
            monthData={monthData}
            onEdit={beginEdit}
            onCreate={beginCreate}
            onDismissReview={dismissReview}
            canEdit={Boolean(config.canEdit)}
          />
        </>
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

      {showInstallHelp ? <InstallHelpDialog onClose={() => setShowInstallHelp(false)} /> : null}
    </main>
  );
}

function InstallHelpDialog({ onClose }) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  return (
    <div className="dialog-backdrop">
      <section className="dialog">
        <header>
          <h2>바로가기 추가</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            x
          </button>
        </header>
        {isIOS ? (
          <ol className="install-help-steps">
            <li>하단 공유 버튼(⬆)을 누르세요.</li>
            <li>메뉴에서 "홈 화면에 추가"를 선택하세요.</li>
            <li>"추가"를 누르면 홈 화면에 바로가기가 생깁니다.</li>
          </ol>
        ) : isAndroid ? (
          <ol className="install-help-steps">
            <li>브라우저 메뉴(⋮)를 여세요.</li>
            <li>"앱 설치" 또는 "홈 화면에 추가"를 선택하세요.</li>
          </ol>
        ) : (
          <ol className="install-help-steps">
            <li>브라우저 주소창 오른쪽의 설치 아이콘을 누르거나, 브라우저 메뉴에서 "설치"를 선택하세요.</li>
            <li>설치하면 바탕화면/시작 메뉴에서 바로 열 수 있습니다.</li>
          </ol>
        )}
        <div className="dialog-actions wide">
          <button type="button" className="primary-button" onClick={onClose}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

function PlannerTable({ days, categories, onEdit, onCreate, onDismissReview, canEdit }) {
  const printRowCount = getRowCountForDays(days);

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
        {days.map((day) => {
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
              <td>{event ? <CategoryPill value={event.category} categories={categories} /> : ""}</td>
              <td className="time-cell">{event?.time || ""}</td>
              <td className="title-cell">
                {index === 0 ? <HolidayLine day={day} /> : null}
                {event ? (
                  <button type="button" className="event-title" onClick={() => canEdit && onEdit(event)}>
                    {normalizeBoolean(event.reviewNeeded) ? (
                      <ReviewBadge event={event} canEdit={canEdit} onDismiss={onDismissReview} />
                    ) : null}
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

function MobileCards({ monthData, onEdit, onCreate, onDismissReview, canEdit }) {
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
                  {normalizeBoolean(event.reviewNeeded) ? (
                    <ReviewBadge event={event} canEdit={canEdit} onDismiss={onDismissReview} />
                  ) : null}
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          <div className="field-block">
            <span>시간</span>
            <TimeInput value={draft.time} onChange={(time) => setDraft({ ...draft, time })} />
          </div>
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
          {confirmDelete ? (
            <div className="dialog-actions wide delete-confirm">
              <span className="delete-confirm-text">정말 삭제하시겠습니까? 되돌릴 수 없습니다.</span>
              <button type="button" className="ghost-button" onClick={() => setConfirmDelete(false)}>
                취소
              </button>
              <button type="button" className="danger-button" onClick={onDelete}>
                삭제 확인
              </button>
            </div>
          ) : (
            <div className="dialog-actions wide">
              {canDelete ? (
                <button type="button" className="danger-button" onClick={() => setConfirmDelete(true)}>
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
          )}
        </form>
      </section>
    </div>
  );
}

function TimeInput({ value, onChange }) {
  return (
    <div className="time-input">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        placeholder="09:00"
        aria-label="시간(24시간)"
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(normalizeClock(event.target.value))}
      />
      <div className="time-stepper" aria-label="10분 단위 시간 조절">
        <button type="button" onClick={() => onChange(stepClock(value, 10))} aria-label="10분 올리기">
          +10
        </button>
        <button type="button" onClick={() => onChange(stepClock(value, -10))} aria-label="10분 내리기">
          -10
        </button>
      </div>
    </div>
  );
}

function normalizeClock(value) {
  const parsed = parseClock(value);
  if (!parsed) return value;
  return formatClock(parsed.hour, Math.round(parsed.minute / 10) * 10);
}

function stepClock(value, minutes) {
  const parsed = parseClock(value) || { hour: 9, minute: 0 };
  return formatClock(parsed.hour, Math.round(parsed.minute / 10) * 10 + minutes);
}

function parseClock(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatClock(hour, minute) {
  const totalMinutes = (hour * 60 + minute + 1440) % 1440;
  const nextHour = Math.floor(totalMinutes / 60);
  const nextMinute = totalMinutes % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
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

function ReviewBadge({ event, canEdit, onDismiss }) {
  if (!canEdit) {
    return (
      <span className="review-badge" title="가져오기 시 줄 수가 맞지 않아 검토가 필요합니다">
        검토
      </span>
    );
  }
  return (
    <span
      className="review-badge dismissable"
      role="button"
      tabIndex={0}
      title="눌러서 검토 완료 처리"
      onClick={(event_) => {
        event_.stopPropagation();
        onDismiss(event);
      }}
      onKeyDown={(event_) => {
        if (event_.key !== "Enter" && event_.key !== " ") return;
        event_.preventDefault();
        event_.stopPropagation();
        onDismiss(event);
      }}
    >
      검토
    </span>
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
  return (
    <div className={error ? "status error" : "status"} role="status" aria-live="polite">
      {error || status}
    </div>
  );
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

function plannerChangedKey(slug) {
  return `planner-events-updated:${slug}`;
}
