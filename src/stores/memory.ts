import type { EventRecord, EventStore, RecordEventParams } from "../types";

export class MemoryEventStore implements EventStore {
  private readonly events = new Map<string, EventRecord>();

  async recordEvent(params: RecordEventParams): Promise<void> {
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

  async getLatestEvents(limit: number): Promise<EventRecord[]> {
    const all = Array.from(this.events.values());
    const byNewest = all.sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime());
    return byNewest.slice(0, limit);
  }
}
