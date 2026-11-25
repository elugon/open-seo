import {
  isProjectRestricted,
  ProjectAccessService,
} from "@/server/features/projects/services/ProjectAccessService";
import { AppError } from "@/server/lib/errors";
import type { ToolAuthContext, ToolContext } from "@/server/mcp/context";

type ProjectPermission = "read" | "collaborate";
type ToolPolicy = "safe" | "owner" | ProjectPermission;

// Keep the MCP surface classified by operation semantics. MCP annotations,
// HTTP verbs, and tool names alone do not grant access; unknown tools fail
// closed for restricted identities until explicitly classified here.
const projectPermissions: Record<string, ProjectPermission> = {
  // Reads from persisted project data.
  get_project_context: "read",
  list_saved_keywords: "read",
  get_suggested_keywords: "read",
  estimate_ai_visibility_cost: "read",
  estimate_rank_tracker_cost: "read",
  get_ai_visibility_tracker: "read",
  get_ai_visibility_run: "read",
  get_ai_visibility_results: "read",
  get_ai_visibility_answer: "read",
  get_ai_visibility_sources: "read",
  get_ai_visibility_trend: "read",
  get_rank_tracker: "read",
  get_rank_history: "read",
  get_audit_status: "read",
  get_audit_issues: "read",
  get_audit_pages: "read",
  get_audit_lighthouse: "read",
  list_site_audits: "read",
  list_reports: "read",
  get_report: "read",
  list_report_templates: "read",
  show_search_console_performance: "read",
  show_serp_results: "read",

  // Writes, live external reads, side effects, and provider-backed analysis.
  // Viewers only read data already persisted in OpenSEO. Cost estimates are
  // read-only and are deliberately classified separately.
  research_project_website: "collaborate",
  update_project_context: "collaborate",
  remove_saved_keywords: "collaborate",
  research_keywords: "collaborate",
  save_keywords: "collaborate",
  get_domain_overview: "collaborate",
  get_domain_keyword_suggestions: "collaborate",
  get_backlinks_overview: "collaborate",
  get_backlinks_profile: "collaborate",
  get_serp_results: "collaborate",
  explore_prompt: "collaborate",
  generate_ai_visibility_prompts: "collaborate",
  complete_ai_research_setup: "collaborate",
  research_ai_visibility_prompts: "collaborate",
  update_ai_research_keywords: "collaborate",
  save_ai_visibility_tracker: "collaborate",
  set_ai_visibility_schedule: "collaborate",
  run_ai_visibility_check: "collaborate",
  export_ai_visibility_data: "collaborate",
  create_rank_tracker: "collaborate",
  add_rank_tracking_keywords: "collaborate",
  remove_rank_tracking_keywords: "collaborate",
  pin_rank_tracking_keywords: "collaborate",
  run_rank_tracker: "collaborate",
  get_ranked_keywords: "collaborate",
  find_serp_competitors: "collaborate",
  search_local_businesses: "collaborate",
  get_local_serp_results: "collaborate",
  get_google_business_questions: "collaborate",
  get_business_profile: "collaborate",
  get_business_reviews: "collaborate",
  get_business_updates: "collaborate",
  get_local_rank_grid: "collaborate",
  get_keyword_metrics: "collaborate",
  get_search_console_performance: "collaborate",
  list_search_console_sites: "collaborate",
  inspect_urls: "collaborate",
  list_google_analytics_properties: "collaborate",
  get_google_analytics_organic_landing_pages: "collaborate",
  get_google_analytics_page_performance: "collaborate",
  get_google_analytics_key_events: "collaborate",
  get_search_opportunities: "collaborate",
  get_google_analytics_organic_overview: "collaborate",
  get_google_analytics_traffic_acquisition: "collaborate",
  get_google_analytics_ecommerce_performance: "collaborate",
  get_google_analytics_site_search: "collaborate",
  get_google_analytics_audience_breakdown: "collaborate",
  get_google_analytics_measurement_health: "collaborate",
  set_search_console_site: "collaborate",
  set_google_analytics_property: "collaborate",
  run_site_audit: "collaborate",
  delete_site_audit: "collaborate",
  save_report: "collaborate",
  delete_report: "collaborate",
  save_report_template: "collaborate",
  delete_report_template: "collaborate",
};

const ownerOnlyTools = new Set([
  "create_project",
  "submit_indexnow_urls",
  "set_report_sharing",
  "save_project_website_setup",
]);

const safeProjectlessTools = new Set([
  "whoami",
  "list_projects",
  "search_serp_locations",
  "list_business_categories",
]);

export function classifyRestrictedMcpTool(name: string): ToolPolicy | null {
  if (safeProjectlessTools.has(name)) return "safe";
  if (ownerOnlyTools.has(name)) return "owner";
  return projectPermissions[name] ?? null;
}

export function requireMcpWorkspaceAdmin(actor: ToolAuthContext): void {
  if (isProjectRestricted(actor)) throw new AppError("FORBIDDEN");
}

export async function authorizeRestrictedMcpTool(
  name: string,
  args: unknown,
  context: ToolContext,
): Promise<void> {
  const actor = context.auth;
  if (!isProjectRestricted(actor)) return;

  const classification = classifyRestrictedMcpTool(name);
  if (classification === "safe") return;
  if (classification === "owner") throw new AppError("FORBIDDEN");

  const permission = classification;
  const projectId =
    typeof args === "object" && args !== null && "projectId" in args
      ? args.projectId
      : undefined;
  if (!permission || typeof projectId !== "string" || projectId.length === 0) {
    throw new AppError("FORBIDDEN");
  }

  const project = await ProjectAccessService.getProject(
    actor,
    projectId,
    permission,
  );
  if (!project) throw new AppError("FORBIDDEN");
}
