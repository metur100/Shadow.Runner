import type { RunnerForm } from '../entities/RunnerForm';
import { RunSession } from '../systems/RunSession';
import { SIM_STEP } from '../utils/Constants';
import type { LevelDefinition } from './LevelDefinition';

export type SolverAction = 'none' | 'jump' | 'jumpHigh' | 'slide' | 'switch' | 'switchJump';

const ACTIONS: SolverAction[] = ['none', 'switch', 'jump', 'slide', 'switchJump', 'jumpHigh'];

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
 * (switch, jump, slide). It is a beam search over time: every decision point keeps the most promising
 * distinct states, tries every action, and drops lines that get hit. Because the simulation is
 * deterministic and obstacles are synchronised to distance, a found line works in the real game too.
 */
export function solveLevel(level: LevelDefinition, options: { beam?: number; stepsPerDecision?: number } = {}): SolveResult {
  const beam = options.beam ?? 14;
  const stepsPerDecision = options.stepsPerDecision ?? 5;
  const session = new RunSession(level, { lives: 1 });
  let frontier: Node[] = [{ snap: session.fullSnapshot(), actions: [], score: 0, group: '' }];
  let reached = 0;
  let work = 0;
  let best = null as Node | null;
  const maxDecisions = Math.ceil(level.timeLimit / (SIM_STEP * stepsPerDecision));

  for (let d = 0; d < maxDecisions && frontier.length > 0; d++) {
    const next = new Map<string, Node>();
    for (const node of frontier) {
      for (const action of ACTIONS) {
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
        const score = session.coins + session.crystals - session.switcher.count * 0.6 - (action === 'none' ? 0 : 0.05);
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
  }
}

/** Quantised physical state – lines with the same group and key are interchangeable for survival. */
function stateKey(s: RunSession): string {
  const f = (form: RunnerForm) =>
    `${Math.round(form.h / 6)},${Math.round(form.vy / 120)},${form.onGround ? 1 : 0},${form.slideTimer > 0 ? Math.ceil(form.slideTimer * 5) : 0},${form.dropping ? 1 : 0}`;
  return `${s.switcher.cooldown > 0 ? 1 : 0}|${f(s.physical)}|${f(s.shadow)}`;
}

function groupKey(s: RunSession): string {
  let flags = '';
  for (let i = 0; i < s.switchesOn.length; i++) flags += s.switchesOn[i];
  for (let i = 0; i < s.portalsUsed.length; i++) flags += s.portalsUsed[i];
  return `${s.active}|${flags}|${s.keys}`;
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
