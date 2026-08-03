import { NextRequest, NextResponse } from "next/server";
import { fetchDashboardMobileSummary } from "@/lib/dashboard/mobile-summary";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/mobile-summary
 *
 * Endpoint liviano para el dashboard mobile. La lógica de cálculo vive en
 * lib/dashboard/mobile-summary.ts (reusable por server components que quieran
 * pre-warmear los datos antes del primer paint).
 */
export async function GET(request: NextRequest) {
  try {
    const data = await fetchDashboardMobileSummary(request);
    if (!data) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    return NextResponse.json(successResponse(data), {
      headers: {
        "Cache-Control": "private, max-age=0, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
