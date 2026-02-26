import type { EventRecord, EventStore } from "../types";

export class MemoryEventStore implements EventStore {
  private readonly events = new Map<string, EventRecord>();

  async recordEvent(params: {
    runId: string;
    stepId: string;
    event: "open" | "click";
    url?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    const key = `${params.runId}:${params.stepId}`;
    if (this.events.has(key)) {
      return;
    }

    this.events.set(key, {
      ...params,
      firedAt: new Date(),
    });
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const key = `${params.runId}:${params.stepId}`;
    return this.events.get(key) ?? null;
  }
}
