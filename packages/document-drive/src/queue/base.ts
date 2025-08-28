import type { IJob, IQueue, Job, JobId } from "document-drive";

export class MemoryQueue<T> implements IQueue<T> {
  private id: string;
  private running = false;
  private deleted = false;
  private items: IJob<T>[] = [];
  private dependencies = new Array<JobId>();

  constructor(id: string) {
    this.id = id;
  }
  async isRunning(): Promise<boolean> {
    return this.running;
  }
  async setRunning(running: boolean) {
    this.running = running;
  }

  async setDeleted(deleted: boolean) {
    this.deleted = deleted;
  }

  async isDeleted() {
    return this.deleted;
  }

  async addJob(data: IJob<T>) {
    this.items.push(data);
    return Promise.resolve();
  }

  async getNextJob() {
    const job = this.items.shift();
    return Promise.resolve(job);
  }

  async amountOfJobs() {
    return Promise.resolve(this.items.length);
  }

  getId() {
    return this.id;
  }

  async isBlocked() {
    return this.running || this.deleted || this.dependencies.length > 0;
  }

  async getJobs() {
    return this.items;
  }

  async addDependency(job: IJob<Job>) {
    if (!this.dependencies.includes(job.jobId)) {
      this.dependencies.push(job.jobId);
    }
  }

  async removeDependency(job: IJob<Job>) {
    const index = this.dependencies.indexOf(job.jobId);
    if (index > -1) {
      this.dependencies.splice(index, 1);
    }
  }
}
