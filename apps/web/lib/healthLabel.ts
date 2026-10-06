/** Plain words for a source's status, instead of internal health codes. */
const LABELS: Record<string, string> = {
  ok: "working",
  degraded: "irregular",
  broken: "not delivering",
  unknown: "not checked yet",
  muted: "muted",
  "not in system": "not added",
};

export function healthLabel(status: string): string {
  return LABELS[status] ?? status;
}
