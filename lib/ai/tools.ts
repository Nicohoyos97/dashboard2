// Nick tool definitions (entity-scoped server-side, read-only). The schemas
// and handlers live in ./nick/tools; this module keeps the path docs/PLAN.md names.
export { TOOL_DESCRIPTIONS, TOOL_INPUTS, TOOL_NAMES, toolDefinitions } from './nick/tools/schemas';
export type { ToolDefinition, ToolInput, ToolName } from './nick/tools/schemas';
export { runTool } from './nick/tools';
