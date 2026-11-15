import { Injectable } from "@angular/core";
import { ThinkingStatusStore } from "./thinking-status";

@Injectable({ providedIn: "root" })
export class ThinkingStatusService extends ThinkingStatusStore {
  constructor() {
    super();
  }
}
