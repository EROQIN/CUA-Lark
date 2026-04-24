export type { Observation } from "../core/types.js";

export interface CaptureContext {
  stepIndex: number;
  phase: "before" | "after";
}
