import { NextRequest } from "next/server";

const unauthorized = () => new Error("unauthorized");

export const getBridgeAgentAuthDebug = (req: NextRequest) => {
  const expected = process.env.MSSQL_BRIDGE_AGENT_TOKEN?.trim() ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return {
    hasExpectedToken: Boolean(expected),
    expectedLength: expected.length,
    hasAuthorizationHeader: Boolean(auth),
    authorizationPrefix: auth ? auth.slice(0, 10) : "",
    receivedLength: token.length,
  };
};

export const requireBridgeAgent = (req: NextRequest) => {
  const expected = process.env.MSSQL_BRIDGE_AGENT_TOKEN?.trim();
  if (!expected) throw new Error("MSSQL_BRIDGE_AGENT_TOKEN eksik");

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== expected) throw unauthorized();
};
