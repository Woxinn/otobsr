import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getDashboardPriorityList,
  getOrderPaymentSummary,
  getOverdueShipments,
  getRfqMissingPrices,
  getSupplierOpenOrders,
  searchProducts,
} from "@/lib/poke-mcp/tools";

type PokeMcpContext = {
  pokeUserId: string | null;
  allowFinance: boolean;
  appBaseUrl: string;
};

const asText = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

export function createPokeMcpServer(context: PokeMcpContext) {
  const supabase = createSupabaseAdminClient(
    context.pokeUserId ? { "x-poke-user-id": context.pokeUserId } : undefined
  );
  const toolContext = {
    supabase,
    appBaseUrl: context.appBaseUrl,
    allowFinance: context.allowFinance,
  };

  const server = new McpServer({
    name: "otobsr-erp",
    version: "0.1.0",
  });

  server.registerTool(
    "ping_system",
    {
      title: "ERP MCP health check",
      description: "Checks whether the Otobsr ERP MCP integration is reachable.",
      inputSchema: {},
    },
    async () =>
      asText({
        ok: true,
        system: "otobsr-erp",
        poke_user_id: context.pokeUserId,
        finance_enabled: context.allowFinance,
        generated_at: new Date().toISOString(),
      })
  );

  server.registerTool(
    "get_dashboard_priority_list",
    {
      title: "Dashboard priority list",
      description:
        "Returns the ERP dashboard priority queue: overdue shipments, missing order documents, production alerts and optional remaining payments.",
      inputSchema: {
        limit: z.number().min(1).max(30).optional().describe("Maximum number of priority items."),
      },
    },
    async (input) => asText(await getDashboardPriorityList(toolContext, input))
  );

  server.registerTool(
    "get_overdue_shipments",
    {
      title: "Overdue shipments",
      description:
        "Lists open shipments whose ETA is overdue. ATA, warehouse delivery and arrived statuses are excluded from overdue logic.",
      inputSchema: {
        limit: z.number().min(1).max(50).optional().describe("Maximum number of shipments."),
      },
    },
    async (input) => asText(await getOverdueShipments(toolContext, input))
  );

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Searches products with the same token-based search logic as the products module. Returns core fields and links.",
      inputSchema: {
        query: z.string().optional().describe("Product code, name, brand, description or notes."),
        limit: z.number().min(1).max(30).optional(),
        include_finance: z
          .boolean()
          .optional()
          .describe("Includes unit price only if finance access is enabled for the MCP server."),
      },
    },
    async (input) => asText(await searchProducts(toolContext, input))
  );

  server.registerTool(
    "get_supplier_open_orders",
    {
      title: "Supplier open orders",
      description:
        "Finds a supplier and lists its open orders. Can optionally include remaining payment if finance access is enabled.",
      inputSchema: {
        supplier_id: z.string().optional(),
        supplier_query: z.string().optional().describe("Supplier name search text if ID is unknown."),
        limit: z.number().min(1).max(50).optional(),
        include_finance: z.boolean().optional(),
      },
    },
    async (input) => asText(await getSupplierOpenOrders(toolContext, input))
  );

  server.registerTool(
    "get_rfq_missing_prices",
    {
      title: "RFQs with missing prices",
      description:
        "Lists open RFQs where at least one supplier has missing or zero prices for one or more RFQ items.",
      inputSchema: {
        limit: z.number().min(1).max(30).optional(),
      },
    },
    async (input) => asText(await getRfqMissingPrices(toolContext, input))
  );

  server.registerTool(
    "get_order_payment_summary",
    {
      title: "Order payment summary",
      description:
        "Returns payment and remaining amount for an order using the supplier carry-over overpayment logic. Requires finance access.",
      inputSchema: {
        order_id: z.string().optional(),
        order_query: z.string().optional().describe("Order name search text if ID is unknown."),
      },
    },
    async (input) => asText(await getOrderPaymentSummary(toolContext, input))
  );

  return server;
}
