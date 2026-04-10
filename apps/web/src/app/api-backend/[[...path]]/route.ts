import type { NextRequest } from "next/server";

/** 本机 FastAPI；multipart 上传不能用 rewrites 可靠转发，故用 Route 流式代理 */
const BACKEND =
  process.env.PPT_BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildTarget(pathname: string, search: string): string {
  const suffix = pathname.replace(/^\/api-backend\/?/, "");
  const base = BACKEND.replace(/\/$/, "");
  return suffix ? `${base}/${suffix}${search}` : `${base}${search}`;
}

async function proxy(req: NextRequest, method: string): Promise<Response> {
  const url = new URL(req.url);
  const target = buildTarget(url.pathname, url.search);
  const headers = new Headers(req.headers);
  for (const h of ["host", "connection", "content-length"]) {
    headers.delete(h);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }

  try {
    const res = await fetch(target, init);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.cause && typeof err.cause === "object" && "code" in err.cause
        ? (err.cause as { code?: string }).code
        : String(err);
    const isConnRefused =
      message === "ECONNREFUSED" || message === "UND_ERR_CONNECT_TIMEOUT" || String(err).includes("ECONNREFUSED");
    return Response.json(
      {
        detail: isConnRefused
          ? "后端服务未启动，请先运行后端（端口 8000）"
          : `代理请求失败: ${message}`,
      },
      { status: isConnRefused ? 502 : 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return proxy(req, "GET");
}

export async function HEAD(req: NextRequest) {
  return proxy(req, "HEAD");
}

export async function POST(req: NextRequest) {
  return proxy(req, "POST");
}

export async function PUT(req: NextRequest) {
  return proxy(req, "PUT");
}

export async function PATCH(req: NextRequest) {
  return proxy(req, "PATCH");
}

export async function DELETE(req: NextRequest) {
  return proxy(req, "DELETE");
}

export async function OPTIONS(req: NextRequest) {
  return proxy(req, "OPTIONS");
}
