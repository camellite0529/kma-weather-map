import "./styles/page.css";
import "./styles/map.css";
import html2canvas from "html2canvas";
import {
  MAP_CITIES,
  TABLE_CITIES,
  PRECIP_CITIES,
  getMarkerPosition,
  type CityWeather,
  type DailyWeather,
} from "./lib/kma";
import { getWeatherData, type WeatherResult } from "./lib/weather";
import { getAstroTimes, type AstroResult } from "./lib/astro";
import {
  createEmptyDustData,
  getDustData,
  type DustData,
  type DustLevel,
  type DustRegionDetailItem,
} from "./lib/dust";
import {
  createEmptySeaForecastData,
  getSeaForecastData,
  type SeaForecastData,
} from "./lib/sea";

const STORAGE_API_KEY = "kma_weather_api_key";
const LEGACY_KEYS = [
  "kma_weather_kma_key",
  "kma_weather_air_key",
  "kma_weather_kasi_key",
] as const;
const STORAGE_NOTE_TITLE = "kma_weather_note_title";
const STORAGE_NOTE_BODY = "kma_weather_note_body";
const STORAGE_NOTE_DATE = "kma_weather_note_date";

/** 춘천–강릉, 세종–청주, 전주–부산 구간처럼 묶음 경계(해당 행 위 가로선을 굵게) */
const PRECIP_STRONG_DIVIDER_BEFORE_CITY = new Set(["강릉", "청주", "부산"]);

type DataLoadToolbarState = "loading" | "complete" | "error";

function labelForDataLoadState(state: DataLoadToolbarState): string {
  if (state === "loading") return "로드중";
  if (state === "error") return "로드 실패";
  return "로드완료";
}

function setToolbarLoadState(app: HTMLElement, state: DataLoadToolbarState) {
  const el = app.querySelector<HTMLElement>("#data-load-status");
  if (!el) return;
  el.dataset.state = state;
  const label = el.querySelector(".data-load-status-label");
  if (label) label.textContent = labelForDataLoadState(state);
}

function html2CanvasCloneNoteInputs(clonedRoot: HTMLElement) {
  clonedRoot.querySelectorAll<HTMLInputElement>(".today-note-short").forEach((input) => {
    const el = input.ownerDocument.createElement("div");
    el.className = input.className;
    el.textContent = input.value;
    input.replaceWith(el);
  });
}

function warmupWeatherExportCanvas(app: HTMLElement) {
  const sheet = app.querySelector<HTMLElement>("#weather-export-root");
  if (!sheet) return;
  const run = () => {
    void html2canvas(sheet, {
      scale: 1,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (_doc, clonedRoot) => {
        html2CanvasCloneNoteInputs(clonedRoot);
      },
    }).catch(() => {});
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function getStoredApiKey(): string {
  const v = localStorage.getItem(STORAGE_API_KEY);
  if (v) return v;
  for (const k of LEGACY_KEYS) {
    const legacy = localStorage.getItem(k);
    if (legacy) return legacy;
  }
  return "";
}

function setStoredApiKey(key: string) {
  localStorage.setItem(STORAGE_API_KEY, key);
  for (const k of LEGACY_KEYS) {
    localStorage.removeItem(k);
  }
}

function clearStoredApiKey() {
  localStorage.removeItem(STORAGE_API_KEY);
  for (const k of LEGACY_KEYS) {
    localStorage.removeItem(k);
  }
}

async function syncApiKeyToServer(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) return;
  try {
    await fetch("/api/user-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceKey: normalized }),
      cache: "no-store",
    });
  } catch {
    // 서버 등록 실패가 클라이언트 데이터 로드를 막지 않도록 무시
  }
}

function getTodayDateString(): string {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

function resetNotesIfDayChanged(): void {
  const today = getTodayDateString();
  const lastNoteDate = localStorage.getItem(STORAGE_NOTE_DATE);
  
  if (lastNoteDate !== today) {
    // Day has changed, reset the notes
    localStorage.removeItem(STORAGE_NOTE_TITLE);
    localStorage.removeItem(STORAGE_NOTE_BODY);
    localStorage.setItem(STORAGE_NOTE_DATE, today);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tempText(value: number | null) {
  return value == null ? "-" : `${Math.round(value)}°`;
}

function displayPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dustClassName(grade: DustLevel) {
  if (grade === "unknown") return "dust-grade dust-unknown";
  if (grade.endsWith("\ub098\uc068")) {
    if (grade.startsWith("\ub9e4\uc6b0")) return "dust-grade dust-very-bad";
    return "dust-grade dust-bad";
  }
  if (grade === "\ubcf4\ud1b5") return "dust-grade dust-normal";
  return "dust-grade dust-good";
}


function dustLabel(grade: DustLevel) {
  if (grade === "unknown") return "\ub370\uc774\ud130 \uc624\ub958";
  return grade;
}
function renderDustDetailTooltip(details: DustRegionDetailItem[] | undefined) {
  if (!details?.length) return "";

  return `
    <div class="marker-tooltip" aria-hidden="true">
      ${details
        .map(
          (detail) => `
            <div class="marker-tooltip-row">
              <span class="marker-tooltip-label">${escapeHtml(detail.label)}</span>
              <span class="marker-tooltip-value">
                미세먼지 ${escapeHtml(detail.pm10)} / 초미세먼지 ${escapeHtml(detail.pm25)}
              </span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function emptyDaily(): DailyWeather {
  return {
    minTemp: null,
    maxTemp: null,
    sky: null,
    amSky: null,
    pmSky: null,
    amPop: null,
    pmPop: null,
  };
}

const EMPTY_ASTRO: AstroResult = {
  sunrise: null,
  sunset: null,
  moonrise: null,
  moonset: null,
  fieldHighlights: {
    sunrise: false,
    sunset: false,
    moonrise: false,
    moonset: false,
  },
};

function createEmptyWeatherResult(): WeatherResult {
  return {
    base: { baseDate: "-", baseTime: "-" },
    updatedAt: "",
    data: MAP_CITIES.map((c) => ({
      city: c.name,
      tomorrow: emptyDaily(),
      dayAfterTomorrow: emptyDaily(),
      threeDaysLater: emptyDaily(),
    })),
    warnings: [],
  };
}

function formatKstFilenameTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${pick("year")}${pick("month")}${pick("day")}-${pick("hour")}${pick("minute")}`;
}

function astroTimeClass(changed: boolean) {
  return changed ? "astro-time astro-value-changed" : "astro-time";
}

function renderAstroCard(astro: AstroResult) {
  const h = astro.fieldHighlights;
  return `
    <section class="card astro-card">
      <div class="astro-row">
        <span class="astro-icon astro-icon-sun">☀</span>
        <span class="astro-label">해뜸</span>
        <span class="${astroTimeClass(h.sunrise)}">${escapeHtml(astro.sunrise ?? "-")}</span>
        <span class="astro-label astro-label-right">해짐</span>
        <span class="${astroTimeClass(h.sunset)}">${escapeHtml(astro.sunset ?? "-")}</span>
      </div>
      <div class="astro-row">
        <span class="astro-icon astro-icon-moon">☾</span>
        <span class="astro-label">달뜸</span>
        <span class="${astroTimeClass(h.moonrise)}">${escapeHtml(astro.moonrise ?? "-")}</span>
        <span class="astro-label astro-label-right">달짐</span>
        <span class="${astroTimeClass(h.moonset)}">${escapeHtml(astro.moonset ?? "-")}</span>
      </div>
    </section>
  `;
}

function renderPrecipChart(rows: CityWeather[]) {
  const ticks = [0, 20, 40, 60, 80, 100];
  const rowsHtml = rows
    .map((row) => {
      const amPercent = displayPercent(row.tomorrow.amPop);
      const pmPercent = displayPercent(row.tomorrow.pmPop);
      const amBar =
        amPercent > 0
          ? `<span class="precip-bar precip-bar-am" style="width: ${amPercent}%"></span>`
          : "";
      const pmBar =
        pmPercent > 0
          ? `<span class="precip-bar precip-bar-pm" style="width: ${pmPercent}%"></span>`
          : "";
      const strongDivider = PRECIP_STRONG_DIVIDER_BEFORE_CITY.has(row.city)
        ? " precip-row-strong"
        : "";
      const ph = row.landPublishHighlights;
      const amCls =
        ph?.tomorrowAmPop === true
          ? "precip-value precip-value-am precip-value-changed"
          : "precip-value precip-value-am";
      const pmCls =
        ph?.tomorrowPmPop === true
          ? "precip-value precip-value-pm precip-value-changed"
          : "precip-value precip-value-pm";
      return `
        <div class="precip-row-item${strongDivider}">
          <div class="precip-label">${escapeHtml(row.city)}</div>
          <div class="precip-track">${amBar}${pmBar}</div>
          <div class="precip-values">
            <span class="${amCls}">${amPercent}%</span>
            <span class="${pmCls}">${pmPercent}%</span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card precip-card">
      <div class="section-header section-header-tight">
        <h2>눈·비올 확률(%)</h2>
        <div class="precip-legend" aria-hidden="true">
          <span class="legend-item">
            <span class="legend-swatch legend-swatch-am"></span>
            오전
          </span>
          <span class="legend-item">
            <span class="legend-swatch legend-swatch-pm"></span>
            오후
          </span>
        </div>
      </div>
      <div class="precip-scale" aria-hidden="true">
        ${ticks.map((t) => `<span style="left: ${t}%">${t}</span>`).join("")}
      </div>
      <div class="precip-chart">${rowsHtml}</div>
    </section>
  `;
}

function renderCompactDayTable(
  title: string,
  rows: CityWeather[],
  kind: "dayAfterTomorrow" | "threeDaysLater",
) {
  const changedKey =
    kind === "dayAfterTomorrow" ? "dayAfterTomorrow" : "threeDaysLater";
  const body = rows
    .map((row) => {
      const ch = row.landPublishHighlights?.[changedKey] === true;
      const cellCls = ch ? "forecast-cell-changed" : "";
      return `
    <tr>
      <th scope="row">${escapeHtml(row.city)}</th>
      <td${cellCls ? ` class="${cellCls}"` : ""}>${escapeHtml(row[kind].sky ?? "-")}</td>
      <td${cellCls ? ` class="${cellCls}"` : ""}>${tempText(row[kind].minTemp)} / ${tempText(row[kind].maxTemp)}</td>
    </tr>`;
    })
    .join("");
  return `
    <div class="forecast-table">
      <div class="forecast-table-title">${escapeHtml(title)}</div>
      <table class="forecast-table-grid">
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderPage(
  weather: WeatherResult,
  astro: AstroResult,
  dust: DustData,
  loadToolbarState: DataLoadToolbarState = "complete",
) {
  const noteTitle = localStorage.getItem(STORAGE_NOTE_TITLE) ?? "";
  const noteBody = localStorage.getItem(STORAGE_NOTE_BODY) ?? "";

  const weatherByCity = new Map(weather.data.map((item) => [item.city, item]));
  const tableRows = TABLE_CITIES.map((city) => weatherByCity.get(city)).filter(
    (item): item is CityWeather => Boolean(item),
  );
  const precipRows = PRECIP_CITIES.map((city) => weatherByCity.get(city)).filter(
    (item): item is CityWeather => Boolean(item),
  );

  const warningsBlock =
    weather.warnings.length > 0
      ? `
    <section class="card warning-card">
      <h2>일부 지역 데이터 지연</h2>
      <ul class="warning-list">
        ${weather.warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join("")}
      </ul>
    </section>`
      : "";

  const markersHtml = weather.data
    .map((item) => {
      const pos = getMarkerPosition(item.city);
      const markerCh =
        item.landPublishHighlights?.tomorrowVisual === true
          ? " marker-card--publish-changed"
          : "";
      return `
      <div class="map-marker" style="left: ${pos.left}; top: ${pos.top}">
        <div class="marker-card${markerCh}">
          <div class="marker-weather">${escapeHtml(item.tomorrow.sky ?? "-")}</div>
          <div class="marker-line">
            <strong class="marker-city">${escapeHtml(item.city)}</strong>
            <span class="marker-temp">
              ${tempText(item.tomorrow.minTemp)} / ${tempText(item.tomorrow.maxTemp)}
            </span>
          </div>
          <div class="marker-tooltip" aria-hidden="true">
            <div class="marker-tooltip-row">
              <span class="marker-tooltip-label">오전</span>
              <span class="marker-tooltip-value">${escapeHtml(item.tomorrow.amSky ?? "-")}</span>
            </div>
            <div class="marker-tooltip-row">
              <span class="marker-tooltip-label">오후</span>
              <span class="marker-tooltip-value">${escapeHtml(item.tomorrow.pmSky ?? "-")}</span>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const dustHead = dust.regions
    .map(
      (item) =>
        `<div class="dust-col-head${item.details?.length ? " dust-detail" : ""}"${item.details?.length ? ' tabindex="0"' : ""}>${escapeHtml(item.displayLabel).replace(/\n/g, "<br />")}${renderDustDetailTooltip(item.details)}</div>`,
    )
    .join("");

  const dustPm10 = dust.regions
    .map((item, idx) => {
      const vh = dust.valueHighlights?.[idx];
      const spanExtra = vh?.pm10 === true ? " dust-grade-bg-changed" : "";
      return `<div class="dust-cell${item.details?.length ? " dust-detail" : ""}"${item.details?.length ? ' tabindex="0"' : ""}><span class="${dustClassName(item.pm10)}${spanExtra}">${escapeHtml(dustLabel(item.pm10))}</span>${renderDustDetailTooltip(item.details)}</div>`;
    })
    .join("");

  const dustPm25 = dust.regions
    .map((item, idx) => {
      const vh = dust.valueHighlights?.[idx];
      const spanExtra = vh?.pm25 === true ? " dust-grade-bg-changed" : "";
      return `<div class="dust-cell${item.details?.length ? " dust-detail" : ""}"${item.details?.length ? ' tabindex="0"' : ""}><span class="${dustClassName(item.pm25)}${spanExtra}">${escapeHtml(dustLabel(item.pm25))}</span>${renderDustDetailTooltip(item.details)}</div>`;
    })
    .join("");

  const updated =
    weather.updatedAt.trim() !== "" && !Number.isNaN(Date.parse(weather.updatedAt))
      ? escapeHtml(
          new Date(weather.updatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          }),
        )
      : "-";

  const loadStatusLabel = labelForDataLoadState(loadToolbarState);

  return `
    <main class="page">
      <div class="sheet-toolbar">
        <button type="button" class="settings-btn" id="settings-btn" aria-haspopup="dialog">
          키 설정
        </button>
        <div
          class="sheet-toolbar-status"
          id="data-load-status"
          data-state="${loadToolbarState}"
          role="status"
          aria-live="polite"
        >
          <span class="data-load-status-label">${loadStatusLabel}</span>
        </div>
        <div class="sheet-toolbar-actions">
          <button type="button" class="weather-refresh-btn" id="weather-refresh-btn">
            데이터 새로고침
          </button>
          <button type="button" class="png-download-btn" id="png-download-btn">
            PNG로 저장
          </button>
        </div>
      </div>
      <div class="a4-sheet" id="weather-export-root">
        <header class="print-head">
          <h1>지면용 오늘의 날씨</h1>
          <div class="print-meta">
            <div>
              발표기준: ${escapeHtml(weather.base.baseDate)} ${escapeHtml(weather.base.baseTime)}
            </div>
            <div>업데이트: ${updated}</div>
          </div>
        </header>
        <div class="top-layout">
          <section class="card today-note-section">
            <div class="today-note-top">
              <div class="today-note-title">오늘의 날씨</div>
              <input
                class="today-note-short"
                type="text"
                placeholder="날씨 제목 여기에"
                value="${escapeHtml(noteTitle)}"
              />
            </div>
            <textarea
              class="today-note-long"
              placeholder="여기에 본문을 입력해 주세요. 적은 내용은 이 컴퓨터에서만 저장됩니다. 프린트할 때 배경 그래픽에 꼭 체크!"
            >${escapeHtml(noteBody)}</textarea>
          </section>
          <div class="astro-side">
            <div class="notice-button-row">
            <a
              class="notice-link-btn"
              href="https://www.weather.go.kr/w/forecast/notice.do"
              target="_blank"
              rel="noreferrer noopener"
            >
              통보문
            </a>
            <a
              class="notice-link-btn"
              href="https://www.airkorea.or.kr/web/dustForecast?pMENU_NO=113"
              target="_blank"
              rel="noreferrer noopener"
            >
              미세먼지
            </a>
            <button
              type="button"
              class="notice-link-btn"
              id="sea-forecast-btn"
              aria-haspopup="dialog"
            >
              파고
            </button>
          </div>
            ${renderAstroCard(astro)}
          </div>
        </div>
        ${warningsBlock}
        <div class="news-layout">
          <section class="card layout-map">
            <div class="map-shell">
              <div class="map-stage">
                <h2 class="map-title">전국날씨(℃)</h2>
                <img src="${import.meta.env.BASE_URL}map-bg.png" alt="대한민국 지도" class="map-image" />
                ${markersHtml}
              </div>
            </div>
          </section>
          <div class="right-column">
            ${renderPrecipChart(precipRows)}
            <section class="card forecast-card">
              <div class="section-header section-header-tight">
                <h2>예상날씨(℃)</h2>
              </div>
              <div class="forecast-grid">
                ${renderCompactDayTable("내일", tableRows, "dayAfterTomorrow")}
                ${renderCompactDayTable("모레", tableRows, "threeDaysLater")}
              </div>
            </section>
          </div>
          <section class="card dust-card">
            <div class="section-header section-header-tight dust-header">
              <h2>오늘의 미세먼지</h2>
              <div class="dust-meta">
                <span class="dust-announced">발표: ${escapeHtml(dust.announcedAt ?? "-")}</span>
              </div>
            </div>
            <div class="dust-table">
              <div class="dust-table-head">
                <div class="dust-left-spacer"></div>
                ${dustHead}
              </div>
              <div class="dust-table-row">
                <div class="dust-row-label">미세먼지</div>
                ${dustPm10}
              </div>
              <div class="dust-table-row">
                <div class="dust-row-label">초미세먼지</div>
                ${dustPm25}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  `;
}

function renderSeaForecastDialogHtml(sea: SeaForecastData) {
  const rows = sea.regions
    .map((item) => {
      const value = item.waveRangeText ? `${item.waveRangeText}m` : "-";
      return `
        <div class="sea-forecast-row">
          <span class="sea-forecast-region">${escapeHtml(item.label)}</span>
          <strong class="sea-forecast-value">${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <div class="api-key-overlay" id="sea-forecast-overlay">
      <div class="api-key-dialog sea-forecast-dialog" role="dialog" aria-modal="true" aria-labelledby="sea-forecast-title">
        <h2 id="sea-forecast-title">내일 파고 예보</h2>
        <div class="sea-forecast-list">
          ${rows}
        </div>
        <p class="sea-forecast-summary" id="sea-forecast-summary">${escapeHtml(sea.summaryText)}</p>
        <div class="api-key-actions">
          <button type="button" id="sea-forecast-copy">복사</button>
          <button type="button" class="secondary" id="sea-forecast-close">닫기</button>
        </div>
      </div>
    </div>
  `;
}

function copyTextWithFallback(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const copied = document.execCommand("copy");
      if (!copied) {
        reject(new Error("복사 실패"));
        return;
      }
      resolve();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("복사 실패"));
    } finally {
      textarea.remove();
    }
  });
}

function bindSeaForecastButton(app: HTMLElement, sea: SeaForecastData) {
  const btn = app.querySelector<HTMLButtonElement>("#sea-forecast-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (app.querySelector("#sea-forecast-overlay")) return;

    app.insertAdjacentHTML("beforeend", renderSeaForecastDialogHtml(sea));
    const overlay = app.querySelector<HTMLElement>("#sea-forecast-overlay");
    if (!overlay) return;

    const closeBtn =
      overlay.querySelector<HTMLButtonElement>("#sea-forecast-close");
    const copyBtn =
      overlay.querySelector<HTMLButtonElement>("#sea-forecast-copy");

    let escapeHandler: ((event: KeyboardEvent) => void) | null = null;

    const dismiss = () => {
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
      overlay.remove();
    };

    escapeHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    document.addEventListener("keydown", escapeHandler);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });
    closeBtn?.addEventListener("click", dismiss);

    copyBtn?.addEventListener("click", async () => {
      const originalText = copyBtn.textContent;
      copyBtn.disabled = true;
      try {
        await copyTextWithFallback(sea.summaryText);
        copyBtn.textContent = "복사됨";
      } catch {
        copyBtn.textContent = "복사 실패";
      } finally {
        window.setTimeout(() => {
          copyBtn.textContent = originalText ?? "복사";
          copyBtn.disabled = false;
        }, 1200);
      }
    });
  });
}

function bindPngDownload(container: HTMLElement) {
  const btn = container.querySelector<HTMLButtonElement>("#png-download-btn");
  const sheet = container.querySelector<HTMLElement>("#weather-export-root");
  if (!btn || !sheet) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollX: 0,
        scrollY: -window.scrollY,
        onclone: (_doc, clonedRoot) => {
          html2CanvasCloneNoteInputs(clonedRoot);
        },
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 1),
      );
      if (!blob) {
        window.alert("이미지를 만들지 못했습니다.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `지면용-오늘의날씨-${formatKstFilenameTimestamp()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "PNG 저장에 실패했습니다.");
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadWeatherIntoApp(app: HTMLElement, apiKey: string) {
  const weatherPromise = getWeatherData(apiKey);
  const auxiliaryPromise = Promise.allSettled([
    getAstroTimes(apiKey),
    getDustData(apiKey),
    getSeaForecastData(apiKey),
  ]);

  const weather = await weatherPromise;
  const [astroResult, dustResult, seaResult] = await auxiliaryPromise;
  const astro = astroResult.status === "fulfilled" ? astroResult.value : EMPTY_ASTRO;
  const dust =
    dustResult.status === "fulfilled" ? dustResult.value : createEmptyDustData();
  const sea =
    seaResult.status === "fulfilled"
      ? seaResult.value
      : createEmptySeaForecastData();

  resetNotesIfDayChanged();
  app.innerHTML = renderPage(weather, astro, dust);
  bindPngDownload(app);
  bindTodayNotePersistence(app);
  bindWeatherRefresh(app, apiKey);
  bindSettingsButton(app);
  bindSeaForecastButton(app, sea);
}

function showEmptyShell(
  app: HTMLElement,
  apiKey: string,
  options?: { loadToolbarState?: DataLoadToolbarState; keylessPreview?: boolean },
) {
  const loadToolbarState = options?.loadToolbarState ?? "complete";
  resetNotesIfDayChanged();
  app.innerHTML = renderPage(
    createEmptyWeatherResult(),
    EMPTY_ASTRO,
    createEmptyDustData(),
    loadToolbarState,
  );
  bindPngDownload(app);
  bindTodayNotePersistence(app);
  if (options?.keylessPreview) {
    const refreshBtn = app.querySelector<HTMLButtonElement>("#weather-refresh-btn");
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.title = "API 키를 입력한 뒤 데이터 새로고침을 사용할 수 있습니다.";
    }
  } else {
    bindWeatherRefresh(app, apiKey);
  }
  bindSettingsButton(app);
  bindSeaForecastButton(app, createEmptySeaForecastData());
}

function bindWeatherRefresh(container: HTMLElement, apiKey: string) {
  const btn = container.querySelector<HTMLButtonElement>("#weather-refresh-btn");
  if (!btn) return;

  const refreshLabel = "데이터 새로고침";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const png = container.querySelector<HTMLButtonElement>("#png-download-btn");
    const settings = container.querySelector<HTMLButtonElement>("#settings-btn");
    const seaBtn = container.querySelector<HTMLButtonElement>("#sea-forecast-btn");
    if (png) png.disabled = true;
    if (settings) settings.disabled = true;
    if (seaBtn) seaBtn.disabled = true;
    setToolbarLoadState(container, "loading");
    let showedKeyFormAfterError = false;
    try {
      await loadWeatherIntoApp(container, apiKey);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.";
      showApiKeyForm(container, message);
      showedKeyFormAfterError = true;
    } finally {
      const refreshAgain = container.querySelector<HTMLButtonElement>(
        "#weather-refresh-btn",
      );
      const pngAgain = container.querySelector<HTMLButtonElement>("#png-download-btn");
      const settingsAgain = container.querySelector<HTMLButtonElement>("#settings-btn");
      const seaBtnAgain =
        container.querySelector<HTMLButtonElement>("#sea-forecast-btn");
      if (showedKeyFormAfterError) {
        if (pngAgain) pngAgain.disabled = false;
        if (settingsAgain) settingsAgain.disabled = false;
        if (seaBtnAgain) seaBtnAgain.disabled = false;
        return;
      }
      if (refreshAgain) {
        refreshAgain.disabled = false;
        refreshAgain.textContent = refreshLabel;
      }
      if (pngAgain) pngAgain.disabled = false;
      if (settingsAgain) settingsAgain.disabled = false;
      if (seaBtnAgain) seaBtnAgain.disabled = false;
    }
  });
}

function bindTodayNotePersistence(container: HTMLElement) {
  const titleEl = container.querySelector<HTMLInputElement>(".today-note-short");
  const bodyEl = container.querySelector<HTMLTextAreaElement>(".today-note-long");
  if (!titleEl || !bodyEl) return;

  const save = () => {
    localStorage.setItem(STORAGE_NOTE_TITLE, titleEl.value);
    localStorage.setItem(STORAGE_NOTE_BODY, bodyEl.value);
    localStorage.setItem(STORAGE_NOTE_DATE, getTodayDateString());
  };
  titleEl.addEventListener("input", save);
  bodyEl.addEventListener("input", save);
}

function renderApiKeyDialogHtml(saved: string, variant: "fullscreen" | "settings") {
  const overlayOpen =
    variant === "settings"
      ? `<div class="api-key-overlay" id="api-key-settings-overlay">`
      : `<div class="api-key-overlay">`;
  const closeBtn =
    variant === "settings"
      ? `<button type="button" class="secondary" id="api-key-dialog-close">닫기</button>`
      : "";
  return `
    ${overlayOpen}
      <div class="api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
        <h2 id="api-key-title">API 키 입력</h2>
        <p class="api-key-hint">
          공공데이터포털에서 발급받은 서비스 키를 입력하세요. 기상·미세먼지·천문 API에 동일하게 사용됩니다. 이 브라우저의 localStorage에 저장됩니다.
        </p>
        <form id="api-key-form">
          <div class="api-key-field">
            <label for="api-key-input">서비스 키</label>
            <input id="api-key-input" name="apiKey" type="password" autocomplete="off" value="${escapeHtml(saved)}" placeholder="공공데이터포털 인증키" />
            <div class="api-key-show-row">
              <input type="checkbox" id="api-key-show" />
              <label for="api-key-show">키 표시</label>
            </div>
          </div>
          <div class="api-key-error" id="api-key-error" role="alert"></div>
          <div class="api-key-actions">
            <button type="submit" id="api-key-submit">키 입력</button>
            ${closeBtn}
            <button type="button" class="secondary" id="api-key-clear">저장된 키 지우기</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function attachApiKeyFormHandlers(
  scope: HTMLElement,
  ctx: { app: HTMLElement; mode: "fullscreen" | "settings" },
  fetchError?: string,
) {
  const form = scope.querySelector<HTMLFormElement>("#api-key-form");
  const errEl = scope.querySelector<HTMLDivElement>("#api-key-error");
  const submitBtn = scope.querySelector<HTMLButtonElement>("#api-key-submit");
  const clearBtn = scope.querySelector<HTMLButtonElement>("#api-key-clear");
  const closeBtn = scope.querySelector<HTMLButtonElement>("#api-key-dialog-close");

  function setError(msg: string) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.toggle("visible", Boolean(msg));
  }

  let escapeHandler: ((e: KeyboardEvent) => void) | undefined;

  const dismissSettingsOverlay = () => {
    if (ctx.mode !== "settings") return;
    if (escapeHandler) document.removeEventListener("keydown", escapeHandler);
    escapeHandler = undefined;
    scope.remove();
  };

  if (ctx.mode === "settings") {
    escapeHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissSettingsOverlay();
    };
    document.addEventListener("keydown", escapeHandler);
    scope.addEventListener("click", (e) => {
      if (e.target === scope) dismissSettingsOverlay();
    });
    closeBtn?.addEventListener("click", dismissSettingsOverlay);
  }

  clearBtn?.addEventListener("click", () => {
    clearStoredApiKey();
    const input = scope.querySelector<HTMLInputElement>("#api-key-input");
    if (input) input.value = "";
    setError("");
  });

  const keyInput = scope.querySelector<HTMLInputElement>("#api-key-input");
  const showKey = scope.querySelector<HTMLInputElement>("#api-key-show");
  showKey?.addEventListener("change", () => {
    if (keyInput) keyInput.type = showKey.checked ? "text" : "password";
  });

  if (fetchError) setError(fetchError);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");

    const apiKey = scope.querySelector<HTMLInputElement>("#api-key-input")?.value.trim() ?? "";

    if (!apiKey) {
      setError("API 키를 입력해 주세요.");
      return;
    }

    setStoredApiKey(apiKey);
    void syncApiKeyToServer(apiKey);

    if (submitBtn) submitBtn.disabled = true;

    try {
      if (ctx.mode === "fullscreen") {
        showEmptyShell(ctx.app, apiKey, { loadToolbarState: "loading" });
        await loadWeatherIntoApp(ctx.app, apiKey);
      } else {
        if (escapeHandler) document.removeEventListener("keydown", escapeHandler);
        escapeHandler = undefined;
        await loadWeatherIntoApp(ctx.app, apiKey);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.";
      if (ctx.mode === "fullscreen") {
        showApiKeyForm(ctx.app, message);
      } else {
        setError(message);
      }
    } finally {
      if (ctx.mode === "settings" && submitBtn) submitBtn.disabled = false;
    }
  });
}

function showApiKeyForm(app: HTMLElement, fetchError?: string) {
  const saved = getStoredApiKey();
  showEmptyShell(app, "", { loadToolbarState: "loading", keylessPreview: true });
  app.insertAdjacentHTML("beforeend", renderApiKeyDialogHtml(saved, "fullscreen"));
  attachApiKeyFormHandlers(app, { app, mode: "fullscreen" }, fetchError);
  warmupWeatherExportCanvas(app);
}

function openApiKeySettingsDialog(app: HTMLElement) {
  if (app.querySelector("#api-key-settings-overlay")) return;
  app.insertAdjacentHTML("beforeend", renderApiKeyDialogHtml(getStoredApiKey(), "settings"));
  const overlay = app.querySelector<HTMLElement>("#api-key-settings-overlay");
  if (!overlay) return;
  attachApiKeyFormHandlers(overlay, { app, mode: "settings" });
  overlay.querySelector<HTMLInputElement>("#api-key-input")?.focus();
}

function bindSettingsButton(app: HTMLElement) {
  const btn = app.querySelector<HTMLButtonElement>("#settings-btn");
  if (!btn) return;
  btn.addEventListener("click", () => openApiKeySettingsDialog(app));
}

async function bootstrap() {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;

  const key = getStoredApiKey().trim();
  if (!key) {
    showApiKeyForm(root);
    return;
  }

  void syncApiKeyToServer(key);

  showEmptyShell(root, key, { loadToolbarState: "loading" });
  try {
    await loadWeatherIntoApp(root, key);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.";
    showApiKeyForm(root, message);
  }
}

void bootstrap();
