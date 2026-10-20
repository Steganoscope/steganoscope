// Receive-side numbers for measuring a transfer: codes scanned per second, codes that added nothing,
// and how many it took against the n source blocks. Shown only in builds made with STEGANOSCOPE_STATS=1.
// No React Native imports, so it is tested in Node (test/stats.test.ts).
export type Run = { id: string; n: number; len: number; first: number; last: number; scanned: number; fed: number; useful: number; rank: number };
export type Done = { id: string; n: number; len: number; secs: number; scanned: number; fed: number; duplicates: number; perSec: number };

export class Stats {
  runs = new Map<string, Run>();
  done: Done | null = null;
  scans = 0; // every callback from the camera, including codes of other things
  private t0 = 0;

  // Call for every string the camera reports. `p` is the progress the inbox returned, or null if it ignored the code.
  scan(now: number, p: { id: string; n: number; len: number; rank: number } | null) {
    if (!this.t0) this.t0 = now;
    this.scans++;
    if (!p) return;
    const r = this.runs.get(p.id) ?? { id: p.id, n: p.n, len: p.len, first: now, last: now, scanned: 0, fed: 0, useful: 0, rank: 0 };
    r.fed++; r.last = now;
    if (p.rank > r.rank) { r.useful++; r.rank = p.rank; }
    this.runs.set(p.id, r);
  }

  // Call when a stream is complete.
  finish(id: string) {
    const r = this.runs.get(id);
    if (!r) return;
    const secs = Math.max(0.001, (r.last - r.first) / 1000);
    this.done = { id, n: r.n, len: r.len, secs, scanned: this.scans, fed: r.fed, duplicates: r.fed - r.useful, perSec: r.fed / secs };
    this.runs.delete(id);
    this.scans = 0; this.t0 = 0;
  }

  // The line shown while a stream is in progress.
  live(now: number): string | null {
    const r = [...this.runs.values()].sort((a, b) => b.last - a.last)[0];
    if (!r || now - r.last > 30_000) return null;
    const secs = Math.max(0.5, (r.last - r.first) / 1000);
    return `${(r.fed / secs).toFixed(1)} codes/s · ${r.fed} fed · ${r.fed - r.useful} dup · rank ${r.rank}/${r.n}`;
  }

  report(): string | null {
    const d = this.done;
    return d && `done ${d.len} B in ${d.secs.toFixed(1)} s · ${d.perSec.toFixed(1)} codes/s · ${d.fed} codes for n=${d.n} (${(d.fed / d.n).toFixed(2)}x) · ${d.duplicates} dup · ${d.scanned} scans`;
  }
}
