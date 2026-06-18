import { NextResponse } from "next/server";

export function json(data: unknown, init?: ResponseInit) {
  return new NextResponse(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      }
    }
  );
}
