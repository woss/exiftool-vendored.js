import { TagsTask } from './tags_task'
import { VersionTask } from './version_task'
import { ExifToolProcess } from './exiftool_process'
import { Tags } from './tags'
import { Task } from './task'
export { Tags } from './tags'
export { ExifDate, ExifTime, ExifDateTime, ExifTimeZoneOffset } from './datetime'
import * as _process from 'process'

export interface ExifToolAPI {
  /**
   * @return a promise holding the version number of the vendored ExifTool
   */
  version(): Promise<string>
  /**
   * @return a Promise holding the metadata tags found in `file`.
   */
  read(file: string): Promise<Tags>

  /**
   * Request graceful shut down of any running ExifTool child processes.
   *
   * This may need to be called in `after` or `finally` clauses in tests
   * or scripts for them to exit cleanly.
   */
  end(): void
}

export interface Logger {
  warn(msg: string): void
  error(msg: string): void
}

/**
 * Assign your custom logger to this instance to
 * send errors and warnings to you log. Defaults to `console`.
 */
export let errlogger: Logger = console

/**
 * Manages delegating calls to a vendored running instance of ExifTool.
 *
 * Instantiation is expensive: use the exported singleton instance of this class, `exiftool`.
 */
export class ExifTool implements ExifToolAPI {
  private _procs: ExifToolProcess[] = []
  private _tasks: Task<any>[] = []

  /**
   * @param maxProcs the maximum number of ExifTool child processes to spawn when load merits
   */
  constructor(
    readonly maxProcs: number = 1
  ) {
    _process.on('exit', () => this.end())
  }

  /**
   * @return a Promise to the vendored ExifTool's version 
   */
  version(): Promise<string> {
    return this.enqueueTask(new VersionTask()).promise
  }

  /**
   * @return a Promise holding the metadata tags found in `file`.
   */
  read(file: string): Promise<Tags> {
    return this.enqueueTask(TagsTask.for(file)).promise
  }

  /**
   * Request graceful shut down of any running ExifTool child processes.
   *
   * This may need to be called in `after` or `finally` clauses in tests
   * or scripts for them to exit cleanly.
   */
  end(): Promise<any> {
    this._procs.forEach(p => p.end())
    return Promise.all(this._procs.map(p => p.closedPromise))
  }

  enqueueTask<T>(task: Task<T>): Task<T> {
    this._tasks.push(task)
    this.workIfIdle()
    return task
  }

  private dequeueTask(): Task<any> | undefined {
    return this._tasks.shift()
  }

  private procs(): ExifToolProcess[] {
    return this._procs = this._procs.filter(p => !p.ended)
  }

  private workIfIdle(): void {
    const idle = this._procs.find(p => !p.ended && p.idle)
    if (idle) {
      idle.workIfIdle()
    } else if (this.procs().length < this.maxProcs) {
      this._procs.push(new ExifToolProcess(() => this.dequeueTask()))
    }
  }
}

/**
 * Use this singleton rather than instantiating new ExifTool instances
 * in order to leverage a single running ExifTool process.
 */
export const exiftool: ExifToolAPI = new ExifTool()
