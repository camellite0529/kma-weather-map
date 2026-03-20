import { TABLE_CITIES, getMarkerPosition } from "@/lib/kma";
import { getWeatherData } from "@/lib/weather";
import { getAstroTimes } from "@/lib/astro";
import { getDustData, type DustLevel } from "@/lib/dust";

export const dynamic = "force-dynamic";

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

type DailyWeather = {
  date: string;
  minTemp: number | null;
  maxTemp: number | null;
  sky: string | null;
  amPop: number | null;
  pmPop: number | null;
};

type CityWeather = {
  city: string;
  lat: number;
  lon: number;
  tomorrow: DailyWeather;
  dayAfterTomorrow: DailyWeather;
  threeDaysLater: DailyWeather;
};

function tempText(value: number | null) {
  return value == null ? "-" : `${Math.round(value)}°`;
}

function displayPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function barWidthPercent(value: number | null) {
  const actual = displayPercent(value);
  return actual === 0 ? 0 : actual;
}

function dustClassName(grade: DustLevel) {
  if (grade === "좋음") return "dust-circle dust-good";
  if (grade === "보통") return "dust-circle dust-normal";
  if (grade === "나쁨") return "dust-circle dust-bad";
  return "dust-circle dust-very-bad";
}

function AstroCard({
  sunrise,
  sunset,
  moonrise,
  moonset,
}: {
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
}) {
  return (
    <section className="card astro-card">
      <div className="astro-row">
        <span className="astro-icon astro-icon-sun">☀</span>
        <span className="astro-label">해뜸</span>
        <span className="astro-time">{sunrise ?? "-"}</span>
        <span className="astro-label astro-label-right">해짐</span>
        <span className="astro-time">{sunset ?? "-"}</span>
      </div>
      <div className="astro-row">
        <span className="astro-icon astro-icon-moon">☾</span>
        <span className="astro-label">달뜸</span>
        <span className="astro-time">{moonrise ?? "-"}</span>
        <span className="astro-label astro-label-right">달짐</span>
        <span className="astro-time">{moonset ?? "-"}</span>
      </div>
    </section>
  );
}

function PrecipChart({ rows }: { rows: CityWeather[] }) {
  const ticks = [0, 20, 40, 60, 80, 100];

  return (
    <section className="card precip-card">
      <div className="section-header section-header-tight">
        <h2>눈·비올 확률(%)</h2>
        <div className="precip-legend" aria-hidden="true">
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-am" />오전
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-pm" />오후
          </span>
        </div>
      </div>

      <div className="precip-scale" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${tick}%` }}>
            {tick}
          </span>
        ))}
      </div>

      <div className="precip-chart">
        {rows.map((row) => {
          const amDisplay = displayPercent(row.tomorrow.amPop);
          const pmDisplay = displayPercent(row.tomorrow.pmPop);
          const amWidth = barWidthPercent(row.tomorrow.amPop);
          const pmWidth = barWidthPercent(row.tomorrow.pmPop);

          return (
            <div key={row.city} className="precip-row-item">
              <div className="precip-label">{row.city}</div>
              <div className="precip-track">
                {amWidth > 0 ? (
                  <span
                    className="precip-bar precip-bar-am"
                    style={{ width: `${amWidth}%` }}
                  />
                ) : null}
                {pmWidth > 0 ? (
                  <span
                    className="precip-bar precip-bar-pm"
                    style={{ width: `${pmWidth}%` }}
                  />
                ) : null}
              </div>
              <div className="precip-values">
                <span className="precip-value precip-value-am">{amDisplay}%</span>
                <span className="precip-value precip-value-pm">{pmDisplay}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompactDayTable({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: CityWeather[];
  kind: "dayAfterTomorrow" | "threeDaysLater";
}) {
  return (
    <div className="forecast-table">
      <div className="forecast-table-title">{title}</div>
      <table className="forecast-table-grid">
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.city}`}>
              <th scope="row">{row.city}</th>
              <td>
                {tempText(row[kind].minTemp)} / {tempText(row[kind].maxTemp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page() {
  try {
    const [weather, astro, dust] = await Promise.all([
      getWeatherData(),
      getAstroTimes(),
      getDustData(),
    ]);

    const tomorrowMap = weather.data;
    const tableRows = weather.data.filter((item) => TABLE_CITIES.includes(item.city));
    const precipRows = PRECIP_CITIES.map((city) =>
      weather.data.find((item) => item.city === city),
    ).filter((item): item is CityWeather => Boolean(item));

    return (
      <main className="page">
        <div className="a4-sheet">
          <header className="print-head">
            <h1>지면용 오늘의 날씨</h1>
            <div className="print-meta">
              <div>
                발표기준: {weather.base.baseDate} {weather.base.baseTime}
              </div>
              <div>
                업데이트: {new Date(weather.updatedAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                })}
              </div>
            </div>
          </header>

          <section className="card today-note-section">
            <div className="today-note-top">
              <div className="today-note-title">오늘의 날씨</div>
              <input
                className="today-note-short"
                defaultValue=""
                placeholder="우산 챙기세요"
              />
            </div>
            <textarea
              className="today-note-long"
              defaultValue=""
              placeholder="전국이 대체로 흐리고 곳곳에 비가 내리겠다."
            />
          </section>

          {weather.warnings.length > 0 ? (
            <section className="card warning-card">
              <h2>일부 지역 데이터 지연</h2>
              <ul className="warning-list">
                {weather.warnings.map((warning) => (
                  <li key={`${warning.city}-${warning.message}`}>{warning.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="news-layout">
            <section className="card layout-map">
              <div className="section-header section-header-tight">
                <h2>전국날씨(℃)</h2>
              </div>
              <div className="map-shell">
                <div className="map-stage">
                  <img src="/map-bg.png" alt="대한민국 지도" className="map-image" />
                  {tomorrowMap.map((item) => {
                    const pos = getMarkerPosition(item.city);
                    return (
                      <div
                        key={item.city}
                        className="map-marker"
                        style={{ left: pos.left, top: pos.top }}
                      >
                        <div className="marker-card">
                          <div className="marker-weather">{item.tomorrow.sky ?? "-"}</div>
                          <div className="marker-line">
                            <strong className="marker-city">{item.city}</strong>
                            <span className="marker-temp">
                              {tempText(item.tomorrow.minTemp)} / {tempText(item.tomorrow.maxTemp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="right-column">
              <AstroCard
                sunrise={astro.sunrise}
                sunset={astro.sunset}
                moonrise={astro.moonrise}
                moonset={astro.moonset}
              />
              <PrecipChart rows={precipRows} />
              <section className="card forecast-card">
                <div className="section-header section-header-tight">
                  <h2>예상날씨(℃)</h2>
                </div>
                <div className="forecast-grid">
                  <CompactDayTable title="내일" rows={tableRows} kind="dayAfterTomorrow" />
                  <CompactDayTable title="모레" rows={tableRows} kind="threeDaysLater" />
                </div>
              </section>
            </div>

         <div className="section-header section-header-tight dust-header">
  <h2>오늘의 미세먼지</h2>
  <div className="dust-meta">
    <span className="dust-time">{dust.dataTime ?? "-"}</span>
    <span className="dust-announced">
      발표:{" "}
      {dust.announcedAt
        ? new Date(dust.announcedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })
        : "-"}
    </span>
  </div>
</div> 

              <div className="dust-table">
                <div className="dust-table-head">
                  <div className="dust-left-spacer" />
                  {dust.regions.map((item) => (
                    <div key={`head-${item.region}`} className="dust-col-head">
                      {item.displayLabel}
                    </div>
                  ))}
                </div>

                <div className="dust-table-row">
                  <div className="dust-row-label">미세먼지</div>
                  {dust.regions.map((item) => (
                    <div key={`pm10-${item.region}`} className="dust-cell">
                      <span className={dustClassName(item.pm10)} />
                    </div>
                  ))}
                </div>

                <div className="dust-table-row">
                  <div className="dust-row-label">초미세먼지</div>
                  {dust.regions.map((item) => (
                    <div key={`pm25-${item.region}`} className="dust-cell">
                      <span className={dustClassName(item.pm25)} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="dust-legend">
                <span>
                  <span className="dust-circle dust-good" />좋음
                </span>
                <span>
                  <span className="dust-circle dust-normal" />보통
                </span>
                <span>
                  <span className="dust-circle dust-bad" />나쁨
                </span>
                <span>
                  <span className="dust-circle dust-very-bad" />매우 나쁨
                </span>
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.";

    return (
      <main className="page">
        <div className="a4-sheet">
          <section className="card error-card">
            <h1>기상 데이터 로딩 실패</h1>
            <p>{message}</p>
          </section>
        </div>
      </main>
    );
  }
}
