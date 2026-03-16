#!/usr/bin/env node

const { AgentCore } = require("./agent-core");

async function main() {
  const agent = new AgentCore();
  agent.on("log", (entry) => {
    if (entry.level === "error") {
      console.error(`[mssql-agent] ${entry.message}`, entry.extra ?? "");
      return;
    }
    console.log(`[mssql-agent] ${entry.message}`, entry.extra ?? "");
  });

  await agent.start();
}

main().catch((error) => {
  console.error("[mssql-agent] fatal", error);
  process.exit(1);
});
