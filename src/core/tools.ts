/** 描画ツールの種類と、ツール切替ショートカットでの巡回順 */
export type ToolName = 'pen' | 'eraser' | 'fill' | 'select' | 'move';

export const TOOL_ORDER: readonly ToolName[] = ['pen', 'fill', 'eraser', 'select', 'move'];
