export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getWeatherData } from "@/lib/weather";

export async function GET() {
  try {
    const weather = await getWeatherData();

    return NextResponse.json(weather, {
      headers: {
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
