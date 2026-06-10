import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPokeMcpServer } from "@/lib/poke-mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

const getBearerToken = (request: NextRequest) => {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const validateAuth = (request: NextRequest) => {
  const expected = process.env.POKE_MCP_API_KEY?.trim();
  const url = new URL(request.url);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

  if (!expected) {
    if (process.env.NODE_ENV === "production" && !isLocal) {
      return NextResponse.json(
        { error: "POKE_MCP_API_KEY env gerekli" },
        { status: 500, headers: corsHeaders }
      );
    }
    return null;
  }

  if (getBearerToken(request) !== expected) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "WWW-Authenticate": 'Bearer realm="poke-mcp"',
        },
      }
    );
  }

  return null;
};

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

async function handleMcp(request: NextRequest) {
  const authError = validateAuth(request);
  if (authError) return authError;

  const pokeUserId = request.headers.get("x-poke-user-id");
  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "";
  const allowFinance = process.env.POKE_MCP_ALLOW_FINANCE === "true";

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  const server = createPokeMcpServer({
    pokeUserId,
    allowFinance,
    appBaseUrl,
  });

  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return withCors(response);
}

export async function GET(request: NextRequest) {
  return handleMcp(request);
}

export async function POST(request: NextRequest) {
  return handleMcp(request);
}

export async function DELETE(request: NextRequest) {
  return handleMcp(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
