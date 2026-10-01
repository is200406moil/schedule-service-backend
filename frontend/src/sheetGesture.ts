export type GesturePoint = { x: number; y: number };

export const SHEET_MEDIA_QUERY = "(max-width: 760px), (max-width: 1000px) and (max-height: 500px)";
export const SHEET_DISMISS_DISTANCE = 80;
const DRAG_START_DISTANCE = 8;

export function sheetDragDistance(start: GesturePoint, current: GesturePoint): number {
  const distance = current.y - start.y;
  const sideways = Math.abs(current.x - start.x);
  return distance >= DRAG_START_DISTANCE && distance > sideways * 1.2 ? distance : 0;
}

export function shouldDismissSheet(start: GesturePoint, current: GesturePoint): boolean {
  return sheetDragDistance(start, current) >= SHEET_DISMISS_DISTANCE;
}
