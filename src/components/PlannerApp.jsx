"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildMonthCsv,
  getHolidayLineNames,
  getMonthOptions,
  getPrintContentHeightMm,
  getPrintPaper,
  getPrintRowClass,
  getPrintWeightForDays,
  normalizeBoolean,
  PRINT_MARGIN_MM,
  PRINT_PAPER_SIZES,
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
  memo: "",
  includeWeekend: false,
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
  const [paperSize, setPaperSize] = useState("A4");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [viewingMemoEvent, setViewingMemoEvent] = useState(null);
  const monthOptions = monthData?.monthOptions?.length ? monthData.monthOptions : getMonthOptions(schoolYear);
  const printPageGroups = monthData ? splitDaysForPrint(monthData.days, printPages) : [];

  useEffect(() => {
    loadConfig();
  }, [basePath]);

  useEffect(() => {
    const paper = getPrintPaper(paperSize);
    const contentHeightMm = getPrintContentHeightMm(paperSize);
    const styleTag = document.getElementById("print-paper-style") || document.createElement("style");
    styleTag.id = "print-paper-style";
    // Overrides globals.css's default A4 @page/--print-page-height (later in
    // source order wins for equal-specificity rules), so every paper size
    // shares the same row-height/font-size scaling logic instead of relying
    // on the browser's own size keyword tables.
    styleTag.textContent = `
      @page { size: ${paper.widthMm}mm ${paper.heightMm}mm; margin: ${PRINT_MARGIN_MM}mm; }
      @media print { :root { --print-page-height: ${contentHeightMm}mm; } }
    `;
    if (!styleTag.isConnected) document.head.appendChild(styleTag);
  }, [paperSize]);

  useEffect(() => {
    // Each cell finds its own best-fit font-size independently, instead of
    // the whole row sharing one size - otherwise a single long cell (e.g. a
    // long 일정 제목) would drag every other cell in that row down to match,
    // even though a short 시간/구분 cell next to it had plenty of room.
    // Shrinking is always <= the row's own default size, so a cell never
    // needs more vertical room than the row was already sized for.
    function fitCellToWidth(cell) {
      const startSize = parseFloat(window.getComputedStyle(cell).fontSize) || 20;
      const floor = 5;
      const fitsAt = (size) => {
        cell.style.fontSize = `${size}px`;
        return cell.scrollWidth <= cell.clientWidth;
      };
      if (fitsAt(startSize)) return;
      let lo = floor;
      let hi = startSize;
      fitsAt(lo);
      // Binary search for the largest font-size (down to `floor`) that keeps
      // this cell's content on one line - a few measurement passes beat
      // stepping down 0.5px at a time across every cell on the page.
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) lo = mid;
        else hi = mid;
      }
      fitsAt(lo);
    }
    // Row heights are sized via CSS calc() to sum to exactly one page, but
    // that math can still come up short in practice (rounding, a browser
    // treating a table's own height as a minimum the same way it does for
    // td/tr, printer/PDF quirks) - this is the last-resort guarantee that a
    // day's row is squeezed to visible-but-compressed instead of silently
    // clipped by print-surface's overflow: hidden.
    function fitPrintSurfacesToPage() {
      document.querySelectorAll(".print-surface").forEach((surface) => {
        const table = surface.querySelector(".planner-table");
        if (!table) return;
        table.style.transform = "";
        const surfaceHeight = surface.clientHeight;
        const tableHeight = table.getBoundingClientRect().height;
        if (surfaceHeight > 0 && tableHeight > surfaceHeight) {
          table.style.transform = `scaleY(${surfaceHeight / tableHeight})`;
          table.style.transformOrigin = "top left";
        }
      });
    }
    function resetPrintSurfaceScale() {
      document.querySelectorAll(".planner-table").forEach((table) => {
        table.style.transform = "";
      });
    }
    function shrinkPrintCellsToFit() {
      const cells = document.querySelectorAll(".planner-table tbody tr > *");
      cells.forEach((cell) => {
        cell.style.fontSize = "";
      });
      cells.forEach((cell) => fitCellToWidth(cell));
      fitPrintSurfacesToPage();
    }
    function resetPrintCellFontSizes() {
      document.querySelectorAll(".planner-table tbody tr > *").forEach((cell) => {
        cell.style.fontSize = "";
      });
      resetPrintSurfaceScale();
    }
    function handlePrintMediaChange(event) {
      if (event.matches) shrinkPrintCellsToFit();
      else resetPrintCellFontSizes();
    }
    window.addEventListener("beforeprint", shrinkPrintCellsToFit);
    window.addEventListener("afterprint", resetPrintCellFontSizes);
    // beforeprint/afterprint timing has historically been inconsistent
    // across browsers - matchMedia's change event fires exactly when the
    // browser's rendering actually switches to/from print layout, so it's
    // kept as a second, more fundamental trigger for the same two functions
    // (both are idempotent: shrink always resets every cell first).
    const printMediaQuery = window.matchMedia("print");
    printMediaQuery.addEventListener("change", handlePrintMediaChange);
    return () => {
      window.removeEventListener("beforeprint", shrinkPrintCellsToFit);
      window.removeEventListener("afterprint", resetPrintCellFontSizes);
      printMediaQuery.removeEventListener("change", handlePrintMediaChange);
    };
  }, []);

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
    // The root layout's beforeInteractive script captures beforeinstallprompt
    // before this component ever mounts (Chrome can fire it before React
    // hydrates), so pick that up first - otherwise a prompt that already
    // fired is lost for good and 바로가기 추가 falls back to the manual
    // instructions every time even though the browser was ready to install.
    function handleDeferredInstallPromptReady() {
      if (window.__deferredInstallPrompt) setInstallPrompt(window.__deferredInstallPrompt);
    }
    if (window.__deferredInstallPrompt) {
      setInstallPrompt(window.__deferredInstallPrompt);
    }
    window.addEventListener("deferredinstallpromptready", handleDeferredInstallPromptReady);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("deferredinstallpromptready", handleDeferredInstallPromptReady);
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
    window.__deferredInstallPrompt = null;
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
      memo: event.memo || "",
      includeWeekend: normalizeBoolean(event.includeWeekend, false),
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
            <button type="button" className="highlight-button" onClick={addShortcut}>
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
          <PasswordUnlock
            label="편집 비밀번호"
            buttonLabel="편집권한부여"
            buttonClassName="highlight-button"
            onSubmit={(password) => unlock("edit", password)}
          />
        ) : null}
        <label>
          <span>용지 크기</span>
          <select value={paperSize} onChange={(event) => setPaperSize(event.target.value)}>
            {Object.entries(PRINT_PAPER_SIZES).map(([key, paper]) => (
              <option key={key} value={key}>
                {paper.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>인쇄 페이지</span>
          <select value={printPages} onChange={(event) => setPrintPages(Number(event.target.value))}>
            <option value={1}>1페이지에 맞추기</option>
            <option value={2}>2페이지로 나누기</option>
          </select>
        </label>
      </section>

      <StatusBar status={status} error={error} />

      {config.canEdit ? <p className="date-click-hint">날짜를 클릭하면 그 날짜에 새 일정을 추가할 수 있습니다.</p> : null}

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
                onShowMemo={setViewingMemoEvent}
                canEdit={Boolean(config.canEdit)}
              />
            </section>
          ))}
          <MobileCards
            days={monthData.days}
            categories={monthData.categories}
            onEdit={beginEdit}
            onCreate={beginCreate}
            onDismissReview={dismissReview}
            onShowMemo={setViewingMemoEvent}
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

      {viewingMemoEvent ? <MemoDialog event={viewingMemoEvent} onClose={() => setViewingMemoEvent(null)} /> : null}
    </main>
  );
}

function MemoDialog({ event, onClose }) {
  const memo = String(event.memo ?? "");
  const isLink = /^https?:\/\//i.test(memo.trim());

  return (
    <div className="dialog-backdrop">
      <section className="dialog">
        <header>
          <h2>{event.title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            x
          </button>
        </header>
        {isLink ? (
          <p className="memo-text">
            <a href={memo.trim()} target="_blank" rel="noopener noreferrer">
              {memo.trim()}
            </a>
          </p>
        ) : (
          <p className="memo-text">{memo}</p>
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

function InstallHelpDialog({ onClose }) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  // iPadOS reports itself as "Macintosh" by default; the touch-point check is
  // Apple's own recommended way to still catch it as iOS for cases like this.
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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

function PlannerTable({ days, categories, onEdit, onCreate, onDismissReview, onShowMemo, canEdit }) {
  const printRowWeight = getPrintWeightForDays(days);

  return (
    <table className="planner-table" style={{ "--print-row-weight": String(printRowWeight) }}>
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
            <tr
              key={`${day.date}-${event?.id || "blank"}-${index}`}
              className={`${dayClass(day)} ${getPrintRowClass(day, event, index)}`.trim()}
            >
              {index === 0 ? (
                <>
                  <td rowSpan={events.length} className="date-cell">
                    <button
                      type="button"
                      onClick={() => canEdit && onCreate(day.date)}
                      className="date-button"
                      title={canEdit ? "클릭하여 일정 추가" : undefined}
                    >
                      {day.day}
                    </button>
                  </td>
                  <td rowSpan={events.length}>{day.weekday}</td>
                </>
              ) : null}
              <td>{event ? <CategoryPill value={event.category} categories={categories} /> : ""}</td>
              <td className="time-cell">{event?.time || ""}</td>
              <td className="title-cell">
                {index === 0 ? <HolidayLine day={day} firstEventTitle={events[0]?.title} /> : null}
                {event ? (
                  <button
                    type="button"
                    className="event-title"
                    onClick={() => (canEdit ? onEdit(event) : event.memo && onShowMemo(event))}
                  >
                    {normalizeBoolean(event.reviewNeeded) ? (
                      <ReviewBadge event={event} canEdit={canEdit} onDismiss={onDismissReview} />
                    ) : null}
                    {event.memo ? <span className="memo-badge">memo</span> : null}
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

function MobileCards({ days, categories, onEdit, onCreate, onDismissReview, onShowMemo, canEdit }) {
  return (
    <div className="mobile-cards">
      {days.map((day) => (
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
          <HolidayLine day={day} firstEventTitle={day.events[0]?.title} />
          {day.events.length ? (
            day.events.map((event) => (
              <button
                key={event.id}
                type="button"
                className="mobile-event"
                onClick={() => (canEdit ? onEdit(event) : event.memo && onShowMemo(event))}
              >
                <span>
                  <CategoryPill value={event.category} categories={categories} />
                  {event.time ? <em>{event.time}</em> : null}
                  {normalizeBoolean(event.reviewNeeded) ? (
                    <ReviewBadge event={event} canEdit={canEdit} onDismiss={onDismissReview} />
                  ) : null}
                  {event.memo ? <span className="memo-badge">memo</span> : null}
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
  const categoryNames = categories.map((category) => category.name);
  const directCategory = !categoryNames.includes(draft.category);
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
          <label className="checkbox-label wide">
            <input
              type="checkbox"
              checked={Boolean(draft.includeWeekend)}
              onChange={(event) => setDraft({ ...draft, includeWeekend: event.target.checked })}
            />
            <span>주말 포함 (체크 해제 시 시작일~종료일 사이의 토·일요일에는 이 행사가 표시되지 않습니다)</span>
          </label>
          <label>
            <span>구분</span>
            {directCategory ? (
              <input
                autoFocus
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                placeholder="구분 입력"
              />
            ) : (
              <select
                value={draft.category}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraft({ ...draft, category: next === "(직접입력)" ? "" : next });
                }}
              >
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="(직접입력)">직접입력</option>
              </select>
            )}
          </label>
          <div className="field-block">
            <span>시간</span>
            <TimeRangeInput value={draft.time} onChange={(time) => setDraft({ ...draft, time })} />
          </div>
          <label>
            <span>담당자</span>
            <input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
          </label>
          <label className="wide">
            <span>일정 제목</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="wide">
            <span>장소</span>
            <input value={draft.place} onChange={(event) => setDraft({ ...draft, place: event.target.value })} />
          </label>
          <label className="wide">
            <span>메모 / 링크</span>
            <textarea
              className="memo-input"
              rows={3}
              value={draft.memo || ""}
              placeholder="참고할 메모나 관련 사이트 링크를 입력하세요. 표에는 보이지 않고, 일정을 눌러야 볼 수 있습니다."
              onChange={(event) => setDraft({ ...draft, memo: event.target.value })}
            />
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

// event.time has always been a single free-text string (imported workbooks
// commonly write "09:00~10:30" into one cell) - splitting/joining on "~"
// here keeps that same on-the-wire format while giving the form two proper
// clock pickers instead of requiring the "~" to be typed by hand.
function TimeRangeInput({ value, onChange }) {
  const { start, end } = parseTimeRange(value);
  return (
    <div className="time-range-input">
      <div className="time-range-field">
        <span className="time-range-label">시작</span>
        <TimeInput value={start} onChange={(nextStart) => onChange(formatTimeRange(nextStart, end))} />
      </div>
      <span className="time-range-sep">~</span>
      <div className="time-range-field">
        <span className="time-range-label">종료</span>
        <TimeInput value={end} onChange={(nextEnd) => onChange(formatTimeRange(start, nextEnd))} />
      </div>
    </div>
  );
}

function parseTimeRange(value) {
  const [start = "", end = ""] = String(value ?? "")
    .split("~")
    .map((part) => part.trim());
  return { start, end };
}

function formatTimeRange(start, end) {
  const trimmedStart = String(start ?? "").trim();
  const trimmedEnd = String(end ?? "").trim();
  if (trimmedStart && trimmedEnd) return `${trimmedStart}~${trimmedEnd}`;
  return trimmedStart || trimmedEnd;
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

export function PasswordUnlock({ label, buttonLabel = "확인", buttonClassName = "secondary-button", onSubmit }) {
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
      <button type="submit" className={buttonClassName}>
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

function HolidayLine({ day, firstEventTitle }) {
  const names = getHolidayLineNames(day, firstEventTitle);
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

export function safeFilename(value) {
  return String(value ?? "월별행사계획")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ") || "월별행사계획";
}

function plannerChangedKey(slug) {
  return `planner-events-updated:${slug}`;
}
