import { TABLE_CITIES, getMarkerPosition } from "@/lib/kma";
import { getWeatherData } from "@/lib/weather";

export const dynamic = "force-dynamic";

type DailyWeather = {
  date: string;
  minTemp: number | null;
  maxTemp: number | null;
  sky: string | null;
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

function DayTable({
  title,
  rows,
  kind
}: {
  title: string;
  rows: CityWeather[];
  kind: "dayAfterTomorrow" | "threeDaysLater";
}) {
  return (
    <section className="card">
      <div className="section-header">
        <h2>{title}</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>지역</th>
              <th>최저기온</th>
              <th>최고기온</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${kind}-${row.city}`}>
                <td>{row.city}</td>
                <td>{tempText(row[kind].minTemp)}</td>
                <td>{tempText(row[kind].maxTemp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function Page() {
  try {
    const weather = await getWeatherData();
    const tomorrowMap = weather.data;
    const tableRows = weather.data.filter((item) => TABLE_CITIES.includes(item.city));

    return (
      <main className="page">
        <header className="hero">
          <div>
            <p className="eyebrow">KMA WEATHER BOARD</p>
            <h1>내일 지도 + 모레/글피 기온 보드</h1>
            <p className="subtext">
              내일은 지도 위에 최저/최고/날씨상태를 표시하고, 모레와 글피는 선택 도시만 표로 표시합니다.
            </p>
          </div>
          <div className="meta-box">
            <div>발표기준: {weather.base.baseDate} {weather.base.baseTime}</div>
            <div>업데이트: {new Date(weather.updatedAt).toLocaleString("ko-KR")}</div>
            <div>표시 도시: {weather.data.length}개</div>
          </div>
        </header>

        {weather.warnings.length > 0 ? (
          <section className="card warning-card">
            <h2>일부 지역 데이터 지연</h2>
            <p>
              외부 API 응답 문제로 일부 도시 데이터가 비어 있습니다. 나머지 지역은 정상 표시됩니다.
            </p>
            <ul className="warning-list">
              {weather.warnings.map((warning) => (
                <li key={`${warning.city}-${warning.message}`}>{warning.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="card">
          <div className="section-header">
            <h2>내일 날씨 지도</h2>
            <p>표시항목: 최저기온 / 최고기온 / 날씨상태</p>
          </div>

          <div className="map-shell">
            <div className="map-stage">
              <img src="/map-bg.png" alt="대한민국 지도" className="map-image" />

              {tomorrowMap.map((item) => {
                const pos = getMarkerPosition(item.city);
                return (
                  <div key={item.city} className="map-marker" style={{ left: pos.left, top: pos.top }}>
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

        <div className="grid-2">
          <DayTable title="모레 기온" rows={tableRows} kind="dayAfterTomorrow" />
          <DayTable title="글피 기온" rows={tableRows} kind="threeDaysLater" />
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.";

    return (
      <main className="page">
        <section className="card error-card">
          <h1>기상 데이터 로딩 실패</h1>
          <p>{message}</p>
          <p className="subtext">
            환경변수의 기상청 서비스키가 인코딩 키인지 디코딩 키인지 확인하고, 배포 후 재시도해 주세요.
          </p>
        </section>
      </main>
    );
  }
}
