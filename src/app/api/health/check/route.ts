import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "storeforge-ai",
    checkedAt: new Date().toISOString(),
  });
}
