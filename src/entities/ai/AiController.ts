import type { LivingEntity } from '../living/LivingEntity';
import type { AiTask } from './AiTask';

/**
 * Priority-based AI task selector with mutually-exclusive control channels.
 *
 * Each tick, tasks are considered from highest to lowest priority. A task runs
 * if it is already active and `shouldContinue` holds, or if it is inactive and
 * `shouldStart` holds — but only when its control channels are not already
 * claimed by a higher-priority running task. Tasks dropped this tick get
 * `stop()` exactly once.
 */
export class AiController {
  private readonly tasks: AiTask[] = [];
  private readonly running = new Set<AiTask>();

  /** Adds a task, keeping the list sorted by descending priority. */
  public addTask(task: AiTask): void {
    this.tasks.push(task);
    this.tasks.sort((a, b) => b.priority - a.priority);
  }

  public update(entity: LivingEntity): void {
    let usedFlags = 0;
    const stillRunning = new Set<AiTask>();

    for (const task of this.tasks) {
      const isActive = this.running.has(task);
      const channelsFree = (task.controlFlags & usedFlags) === 0;

      if (isActive) {
        if (channelsFree && task.shouldContinue(entity)) {
          task.tick(entity);
          stillRunning.add(task);
          usedFlags |= task.controlFlags;
        } else {
          task.stop(entity);
        }
      } else if (channelsFree && task.shouldStart(entity)) {
        task.start(entity);
        task.tick(entity);
        stillRunning.add(task);
        usedFlags |= task.controlFlags;
      }
    }

    this.running.clear();
    for (const task of stillRunning) {
      this.running.add(task);
    }
  }
}
