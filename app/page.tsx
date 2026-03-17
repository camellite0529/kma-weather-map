import { TABLE_CITIES, getMarkerPosition } from "@/lib/kma";
import { getWeatherData } from "@/lib/weather";

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
  if (actual === 0) return 0;
  return Math.max(8, actual);
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
    <div className="compact-table">
      <div className="compact-table-title">{title}</div>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={`${kind}-${row.city}`}>
              <th>{row.city}</th>
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

function PrecipChart({ rows }: { rows: CityWeather[] }) {
  const ticks = [0, 20, 40, 60, 80, 100];

  return (
    <section className="card precip-card">
      <div className="section-header section-header-tight">
        <h2>눈·비올 확률(%)</h2>
        <div className="precip-legend">
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-am" />
            오전
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch-pm" />
            오후
          </span>
        </div>
      </div>

      <div className="precip-scale">
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
            <div key={`precip-${row.city}`} className="precip-row">
              <div className="precip-label">{row.city}</div>
              <div className="precip-track">
                {amWidth > 0 ? (
                  <div
                    className="precip-bar precip-bar-am"
                    style={{ width: `${amWidth}%` }}
                    title={`오전 ${amDisplay}%`}
                  >
                    <span className="precip-value">{amDisplay}%</span>
                  </div>
                ) : (
                  <div className="precip-value precip-value-zero precip-value-am-zero">0%</div>
                )}

                {pmWidth > 0 ? (
                  <div
                    className="precip-bar precip-bar-pm"
                    style={{ width: `${pmWidth}%` }}
                    title={`오후 ${pmDisplay}%`}
                  >
                    <span className="precip-value">{pmDisplay}%</span>
                  </div>
                ) : (
                  <div className="precip-value precip-value-zero precip-value-pm-zero">0%</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function Page() {
  try {
    const weather = await getWeatherData();

    const tomorrowMap = weather.data;
    const tableRows = weather.data.filter((item) => TABLE_CITIES.includes(item.city));
    const precipRows = PRECIP_CITIES
      .map((city) => weather.data.find((item) => item.city === city))
      .filter((item): item is CityWeather => Boolean(item));

    return (
      <main className="page">
        <div className="a4-sheet">
          <header className="print-head">
  <div>
    <h1>내일·모레·글피 날씨</h1>
  </div>

  <div className="print-meta">
    <div>
      발표기준: {weather.base.baseDate} {weather.base.baseTime}
    </div>
    <div>
      업데이트: {new Date(weather.updatedAt).toLocaleString("ko-KR")}
    </div>
  </div>
</header>

<section className="card today-note-card">
  <div className="today-note-top">
    <div className="today-note-label">오늘의 날씨</div>
    <input
      type="text"
      className="today-note-short"
      placeholder="짧은 제목 입력"
    />
  </div>

  <textarea
    className="today-note-long"
    placeholder="텍스트 입력"
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
              <PrecipChart rows={precipRows} />

              <section className="card forecast-card">
                <div className="section-header section-header-tight">
                  <h2>예상날씨(℃)</h2>
                </div>

                <div className="forecast-grid">
                  <CompactDayTable title="모레" rows={tableRows} kind="dayAfterTomorrow" />
                  <CompactDayTable title="글피" rows={tableRows} kind="threeDaysLater" />
                </div>
              </section>
            </div>

            <section className="card dust-card">
              <div className="section-header section-header-tight">
                <h2>오늘의 미세먼지</h2>
              </div>
              <div className="blank-card-placeholder" />
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
            <p className="subtext">
              환경변수의 기상청 서비스키와 외부 API 응답 상태를 확인해 주세요.
            </p>
          </section>
        </div>
      </main>
    );
  }
}
