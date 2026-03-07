import { NextRequest } from "next/server";

const unauthorized = () => new Error("unauthorized");

export const requireBridgeAgent = (req: NextRequest) => {
  const expected = process.env.MSSQL_BRIDGE_AGENT_TOKEN?.trim();
  if (!expected) throw new Error("MSSQL_BRIDGE_AGENT_TOKEN eksik");

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== expected) throw unauthorized();
};
