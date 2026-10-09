/**
 * Checkpoint arch. Passing it stores a snapshot of the run; after a hit (with lives left) the run
 * continues from the last checkpoint in exactly the state it had there.
 */
export class Checkpoint {
  constructor(
    readonly x: number,
    readonly index: number,
  ) {}

  reached(runnerX: number): boolean {
    return runnerX >= this.x;
  }
}
