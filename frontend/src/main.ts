import "./styles/page.css";
import "./styles/map.css";
import html2canvas from "html2canvas";
import { TABLE_CITIES, getMarkerPosition, type CityWeather } from "./lib/kma";
import { getWeatherData, type WeatherResult } from "./lib/weather";
import { getAstroTimes, type AstroTimes } from "./lib/astro";
import { getDustData, type DustData, type DustLevel } from "./lib/dust";

const STORAGE_KMA = "kma_weather_kma_key";
const STORAGE_AIR = "kma_weather_air_key";
const STORAGE_KASI = "kma_weather_kasi_key";

const PRECIP_CITIES = [
  "서울",
  "인천",
  "춘천",
  "강릉",
  "대전",
  "세종",
  "청주",
  "광주",
  "전주",
  "부산",
  "울산",
  "대구",
  "제주",
] as const;

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
  if (grade === "좋음") return "dust-circle dust-good";
  if (grade === "보통") return "dust-circle dust-normal";
  if (grade === "나쁨") return "dust-circle dust-bad";
  return "dust-circle dust-very-bad";
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

function renderAstroCard(astro: AstroTimes) {
  return `
    <section class="card astro-card">
      <div class="astro-row">
        <span class="astro-icon astro-icon-sun">☀</span>
        <span class="astro-label">해뜸</span>
        <span class="astro-time">${escapeHtml(astro.sunrise ?? "-")}</span>
        <span class="astro-label astro-label-right">해짐</span>
        <span class="astro-time">${escapeHtml(astro.sunset ?? "-")}</span>
      </div>
      <div class="astro-row">
        <span class="astro-icon astro-icon-moon">☾</span>
        <span class="astro-label">달뜸</span>
        <span class="astro-time">${escapeHtml(astro.moonrise ?? "-")}</span>
        <span class="astro-label astro-label-right">달짐</span>
        <span class="astro-time">${escapeHtml(astro.moonset ?? "-")}</span>
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
      return `
        <div class="precip-row-item">
          <div class="precip-label">${escapeHtml(row.city)}</div>
          <div class="precip-track">${amBar}${pmBar}</div>
          <div class="precip-values">
            <span class="precip-value precip-value-am">${amPercent}%</span>
            <span class="precip-value precip-value-pm">${pmPercent}%</span>
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
  const body = rows
    .map(
      (row) => `
    <tr>
      <th scope="row">${escapeHtml(row.city)}</th>
      <td>${escapeHtml(row[kind].sky ?? "-")}</td>
      <td>${tempText(row[kind].minTemp)} / ${tempText(row[kind].maxTemp)}</td>
    </tr>`,
    )
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

function renderPage(weather: WeatherResult, astro: AstroTimes, dust: DustData) {
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
      return `
      <div class="map-marker" style="left: ${pos.left}; top: ${pos.top}">
        <div class="marker-card">
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
        `<div class="dust-col-head">${escapeHtml(item.displayLabel).replace(/\n/g, "<br />")}</div>`,
    )
    .join("");

  const dustPm10 = dust.regions
    .map(
      (item) =>
        `<div class="dust-cell"><span class="${dustClassName(item.pm10)}"></span></div>`,
    )
    .join("");

  const dustPm25 = dust.regions
    .map(
      (item) =>
        `<div class="dust-cell"><span class="${dustClassName(item.pm25)}"></span></div>`,
    )
    .join("");

  const updated = escapeHtml(
    new Date(weather.updatedAt).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    }),
  );

  return `
    <main class="page">
      <div class="sheet-toolbar">
        <button type="button" class="png-download-btn" id="png-download-btn">
          PNG로 저장
        </button>
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
              />
            </div>
            <textarea
              class="today-note-long"
              placeholder="여기에 본문을 입력해 주세요."
            ></textarea>
          </section>
          ${renderAstroCard(astro)}
        </div>
        ${warningsBlock}
        <div class="news-layout">
          <section class="card layout-map">
            <div class="section-header section-header-tight">
              <h2>전국날씨(℃)</h2>
            </div>
            <div class="map-shell">
              <div class="map-stage">
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
                <span class="dust-time">${escapeHtml(dust.dataTime ?? "-")}</span>
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
            <div class="dust-legend">
              <span><span class="dust-circle dust-good"></span> 좋음</span>
              <span><span class="dust-circle dust-normal"></span> 보통</span>
              <span><span class="dust-circle dust-bad"></span> 나쁨</span>
              <span><span class="dust-circle dust-very-bad"></span> 매우 나쁨</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  `;
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

function renderError(message: string) {
  return `
    <main class="page">
      <div class="a4-sheet">
        <section class="card error-card">
          <h1>기상 데이터 로딩 실패</h1>
          <p>${escapeHtml(message)}</p>
        </section>
      </div>
    </main>
  `;
}

function showApiKeyForm(app: HTMLElement) {
  const savedKma = localStorage.getItem(STORAGE_KMA) ?? "";
  const savedAir = localStorage.getItem(STORAGE_AIR) ?? "";
  const savedKasi = localStorage.getItem(STORAGE_KASI) ?? "";

  app.innerHTML = `
    <div class="api-key-overlay">
      <div class="api-key-dialog" role="dialog" aria-labelledby="api-key-title">
        <h2 id="api-key-title">API 키 입력</h2>
        <p class="api-key-hint">
          공공데이터포털·에어코리아 등에서 발급받은 서비스 키를 입력하세요. 키는 이 브라우저의 로컬 저장소(localStorage)에 저장되며, 같은 기기·브라우저에서는 다음에도 유지됩니다.
        </p>
        <form id="api-key-form">
          <div class="api-key-field">
            <label for="kma-key">기상청 단기예보 (KMA)</label>
            <input id="kma-key" name="kma" type="password" autocomplete="off" value="${escapeHtml(savedKma)}" placeholder="VilageFcstInfoService_2.0" />
          </div>
          <div class="api-key-field">
            <label for="air-key">한국환경공단 미세먼지 (Air Korea)</label>
            <input id="air-key" name="air" type="password" autocomplete="off" value="${escapeHtml(savedAir)}" placeholder="한국환경공단 OpenAPI" />
          </div>
          <div class="api-key-field">
            <label for="kasi-key">천문대 일출·월출 (KASI)</label>
            <input id="kasi-key" name="kasi" type="password" autocomplete="off" value="${escapeHtml(savedKasi)}" placeholder="RiseSetInfoService" />
          </div>
          <div class="api-key-error" id="api-key-error" role="alert"></div>
          <div class="api-key-actions">
            <button type="submit" id="api-key-submit">불러오기</button>
            <button type="button" class="secondary" id="api-key-clear">저장된 키 지우기</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = app.querySelector<HTMLFormElement>("#api-key-form");
  const errEl = app.querySelector<HTMLDivElement>("#api-key-error");
  const submitBtn = app.querySelector<HTMLButtonElement>("#api-key-submit");
  const clearBtn = app.querySelector<HTMLButtonElement>("#api-key-clear");

  function setError(msg: string) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.toggle("visible", Boolean(msg));
  }

  clearBtn?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KMA);
    localStorage.removeItem(STORAGE_AIR);
    localStorage.removeItem(STORAGE_KASI);
    for (const id of ["#kma-key", "#air-key", "#kasi-key"] as const) {
      const el = app.querySelector<HTMLInputElement>(id);
      if (el) el.value = "";
    }
    setError("");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");

    const kma = app.querySelector<HTMLInputElement>("#kma-key")?.value.trim() ?? "";
    const air = app.querySelector<HTMLInputElement>("#air-key")?.value.trim() ?? "";
    const kasi = app.querySelector<HTMLInputElement>("#kasi-key")?.value.trim() ?? "";

    if (!kma || !air || !kasi) {
      setError("세 가지 API 키를 모두 입력해 주세요.");
      return;
    }

    localStorage.setItem(STORAGE_KMA, kma);
    localStorage.setItem(STORAGE_AIR, air);
    localStorage.setItem(STORAGE_KASI, kasi);

    if (submitBtn) submitBtn.disabled = true;
    app.innerHTML = `<div class="app-loading">데이터를 불러오는 중…</div>`;

    try {
      const [weather, astro, dust] = await Promise.all([
        getWeatherData(kma),
        getAstroTimes(kasi),
        getDustData(air),
      ]);
      app.innerHTML = renderPage(weather, astro, dust);
      bindPngDownload(app);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.";
      app.innerHTML = renderError(message);
    }
  });
}

const root = document.querySelector<HTMLDivElement>("#app");
if (root) showApiKeyForm(root);
