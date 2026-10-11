import type { RunnerForm } from '../entities/RunnerForm';
import { RunSession } from '../systems/RunSession';
import { SIM_STEP } from '../utils/Constants';
import type { LevelDefinition } from './LevelDefinition';

export type SolverAction = 'none' | 'jump' | 'jumpHigh' | 'slide' | 'switch' | 'switchJump' | 'left' | 'right';

const ACTIONS: SolverAction[] = ['none', 'switch', 'jump', 'slide', 'left', 'right', 'switchJump', 'jumpHigh'];

export interface SolveResult {
  solved: boolean;
  /** Distance reached by the best surviving line. */
  reached: number;
  length: number;
  /** Inputs of the winning line, one per decision (every `stepsPerDecision` simulation steps). */
  actions: SolverAction[];
  coins: number;
  crystals: number;
  switches: number;
  /** Simulation steps used by the search (for performance reporting). */
  work: number;
}

interface Node {
  snap: ReturnType<RunSession['fullSnapshot']>;
  actions: SolverAction[];
  score: number;
  /** Active form + switch / portal / key state: lines in different groups face different futures. */
  group: string;
}

/**
 * Proves a level can be finished without taking any damage, using only the inputs a player has
 * (switch, jump, slide, lane left / right). It is a beam search over time: every decision point keeps the most promising
 * distinct states, tries every action, and drops lines that get hit. Because the simulation is
 * deterministic and obstacles are synchronised to distance, a found line works in the real game too.
 */
export function solveLevel(level: LevelDefinition, options: { beam?: number; stepsPerDecision?: number; lanes?: boolean } = {}): SolveResult {
  // Without an explicit beam width, a failed search is retried wider before the level counts as unsolvable.
  const widths = options.beam !== undefined ? [options.beam] : [14, 32, 64];
  let result: SolveResult | null = null;
  let work = 0;
  for (const beam of widths) {
    result = search(level, beam, options.stepsPerDecision ?? 5, options.lanes ?? true);
    work += result.work;
    if (result.solved) break;
  }
  return { ...(result as SolveResult), work };
}

function search(level: LevelDefinition, beam: number, stepsPerDecision: number, lanes: boolean): SolveResult {
  const session = new RunSession(level, { lives: 1 });
  let frontier: Node[] = [{ snap: session.fullSnapshot(), actions: [], score: 0, group: '' }];
  let reached = 0;
  let work = 0;
  let best = null as Node | null;
  const maxDecisions = Math.ceil(level.timeLimit / (SIM_STEP * stepsPerDecision));
  const laneWindows = session.obstacles
    .filter((o) => o.lane !== null)
    .map((o): [number, number] => (o.kind === 'train' ? [o.x - (o.def.trigger ?? 420) - 300, o.x + o.w] : [o.minX - LANE_LOOKAHEAD, o.maxX]));

  for (let d = 0; d < maxDecisions && frontier.length > 0; d++) {
    const next = new Map<string, Node>();
    for (const node of frontier) {
      session.fullRestore(node.snap);
      const laneMoves = lanes && laneMatters(session, laneWindows);
      for (const action of ACTIONS) {
        if (!laneMoves && (action === 'left' || action === 'right')) continue;
        session.fullRestore(node.snap);
        if (!apply(session, action)) continue;
        let alive = true;
        for (let s = 0; s < stepsPerDecision; s++) {
          session.step(SIM_STEP);
          work++;
          if (session.state === 'hit' || session.state === 'failed') {
            alive = false;
            break;
          }
          if (session.state === 'complete') break;
          // Release a normal jump right away so 'jump' is the short hop and 'jumpHigh' the full one.
          if (s === 1 && (action === 'jump' || action === 'switchJump')) session.releaseJump();
        }
        if (!alive) continue;
        reached = Math.max(reached, session.x);
        const actions = [...node.actions, action];
        const score = session.coins + session.crystals - session.switcher.count * 0.6 - session.laneChanges * 0.1 - (action === 'none' ? 0 : 0.05);
        if (session.state === 'complete') {
          if (!best || score > best.score) best = { snap: session.fullSnapshot(), actions, score, group: '' };
          continue;
        }
        const group = groupKey(session);
        const key = `${group}|${stateKey(session)}`;
        const existing = next.get(key);
        if (!existing || existing.score < score) next.set(key, { snap: session.fullSnapshot(), actions, score, group });
      }
    }
    if (best) break;
    frontier = diverse([...next.values()], beam);
  }

  if (best) {
    session.fullRestore(best.snap);
    return {
      solved: true,
      reached: level.length,
      length: level.length,
      actions: best.actions,
      coins: session.coins,
      crystals: session.crystals,
      switches: session.switcher.count,
      work,
    };
  }
  return { solved: false, reached, length: level.length, actions: [], coins: 0, crystals: 0, switches: 0, work };
}

function apply(session: RunSession, action: SolverAction): boolean {
  switch (action) {
    case 'none':
      return true;
    case 'jump':
      session.jump(0);
      return true;
    case 'jumpHigh':
      session.jump(1);
      return true;
    case 'slide':
      session.slide();
      return true;
    case 'switch':
      return session.switchForm();
    case 'switchJump':
      if (!session.switchForm()) return false;
      session.jump(0);
      return true;
    case 'left':
      return session.moveLane(-1);
    case 'right':
      return session.moveLane(1);
  }
}

/** Feeds one solver action to a session (also used to replay a solution in the real game). */
export function applyAction(session: RunSession, action: SolverAction): boolean {
  return apply(session, action);
}

/** How far ahead (world units) a lane obstacle or an item in another lane makes lane moves worth trying. */
const LANE_LOOKAHEAD = 700;

/**
 * Lane moves only matter near lane obstacles or items in another lane. Elsewhere they are left out, so
 * they cannot crowd the beam with sideways variants of the same line (precise jump timings would die out).
 */
function laneMatters(s: RunSession, windows: readonly [number, number][]): boolean {
  for (const [x0, x1] of windows) if (s.x >= x0 && s.x <= x1) return true;
  for (const c of s.collectibles) {
    if (c.x < s.x) continue;
    if (c.x > s.x + LANE_LOOKAHEAD) break;
    if (!s.collected[c.index] && c.lane !== s.lane) return true;
  }
  return false;
}

/** Quantised physical state – lines with the same group and key are interchangeable for survival. */
function stateKey(s: RunSession): string {
  const f = (form: RunnerForm) =>
    `${Math.round(form.h / 6)},${Math.round(form.vy / 120)},${form.onGround ? 1 : 0},${form.slideTimer > 0 ? Math.ceil(form.slideTimer * 5) : 0},${form.dropping ? 1 : 0}`;
  return `${s.switcher.cooldown > 0 ? 1 : 0}|${Math.round(s.lx * 4)}|${f(s.physical)}|${f(s.shadow)}`;
}

function groupKey(s: RunSession): string {
  let flags = '';
  for (let i = 0; i < s.switchesOn.length; i++) flags += s.switchesOn[i];
  for (let i = 0; i < s.portalsUsed.length; i++) flags += s.portalsUsed[i];
  return `${s.active}|${s.lane}|${flags}|${s.keys}`;
}

/**
 * Keeps the best `width` nodes, but always the best one of every group (active form × switch state), so
 * an option that only pays off later – such as NOT touching a lamp – never dies out early.
 */
function diverse(nodes: Node[], width: number): Node[] {
  nodes.sort((a, b) => b.score - a.score);
  if (nodes.length <= width) return nodes;
  const keep: Node[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (!seen.has(n.group)) {
      seen.add(n.group);
      keep.push(n);
    }
  }
  for (const n of nodes) {
    if (keep.length >= width) break;
    if (!keep.includes(n)) keep.push(n);
  }
  return keep;
}
