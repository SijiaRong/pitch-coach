import { randomUUID } from 'node:crypto';
import { aggregateReport, getPanel, prepareReview } from '@pitchcoach/shared';
import type { InvestorReview, JobStatus, Submission } from '@pitchcoach/shared';
import type { Config } from './config';
import type { Reviewer } from './provider';
import { PublicError } from './errors';

interface Job {
  owner: string;
  expiresAt: number;
  controller: AbortController;
  state: JobStatus;
}

export class EvaluationJobs {
  private jobs = new Map<string, Job>();
  private daily = new Map<string, { count: number; expiresAt: number }>();
  private active = 0;
  constructor(
    private config: Config,
    private reviewer: Reviewer,
  ) {}

  sweep() {
    const now = Date.now();
    for (const [id, job] of this.jobs)
      if (job.expiresAt <= now) {
        job.controller.abort();
        this.jobs.delete(id);
      }
    for (const [id, entry] of this.daily) if (entry.expiresAt <= now) this.daily.delete(id);
  }

  create(owner: string, submission: Submission): JobStatus {
    this.sweep();
    if (this.active >= this.config.MAX_ACTIVE_EVALUATIONS || this.jobs.size >= 1000)
      throw new PublicError(429, 'AI_BUSY', '投委会正忙，请稍后再试');
    if (
      [...this.jobs.values()].some((job) => job.owner === owner && job.state.status === 'running')
    )
      throw new PublicError(409, 'ALREADY_RUNNING', '已有一份项目正在评估，请等待完成');
    const limit = this.daily.get(owner);
    if (limit && limit.count >= this.config.DAILY_EVALUATIONS_PER_USER)
      throw new PublicError(429, 'DAILY_LIMIT', '今日评估次数已用完，明天再来打磨项目');
    if (!limit && this.daily.size >= 10000)
      throw new PublicError(429, 'AI_BUSY', '服务繁忙，请稍后再试');
    this.daily.set(owner, {
      count: (limit?.count ?? 0) + 1,
      expiresAt: limit?.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
    });
    const id = randomUUID();
    const job: Job = {
      owner,
      expiresAt: Date.now() + 10 * 60 * 1000,
      controller: new AbortController(),
      state: { id, status: 'running', completedInvestors: 0, totalInvestors: 3 },
    };
    this.jobs.set(id, job);
    this.active++;
    void this.run(job, submission).finally(() => {
      this.active--;
    });
    return { ...job.state };
  }

  private async run(job: Job, submission: Submission) {
    try {
      const results = await Promise.allSettled(
        getPanel(submission.industry, submission.round, submission.preferences).map(
          async (investor) => {
            try {
              const result = await this.reviewer(submission, investor, job.controller.signal);
              return prepareReview(result.content, investor.id, result.model, submission);
            } finally {
              job.state.completedInvestors++;
            }
          },
        ),
      );
      if (job.controller.signal.aborted) return;
      const reviews = results
        .filter(
          (result): result is PromiseFulfilledResult<InvestorReview> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);
      if (!reviews.length) {
        const first = results.find(
          (result) => result.status === 'rejected',
        ) as PromiseRejectedResult;
        throw first.reason;
      }
      job.state.report = aggregateReport(submission, reviews, { id: job.state.id, mode: 'live' });
      job.state.status = 'done';
    } catch (error) {
      job.state.status = 'failed';
      job.state.error =
        error instanceof PublicError
          ? { code: error.code, message: error.message }
          : { code: 'EVALUATION_FAILED', message: '评估未完成，请稍后重试' };
      // Failed attempts do not consume the daily allowance.
      const entry = this.daily.get(job.owner);
      if (entry) entry.count = Math.max(0, entry.count - 1);
    }
  }

  get(id: string, owner: string): JobStatus {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner)
      throw new PublicError(404, 'REPORT_NOT_FOUND', '报告已过期或不存在，请重新评估');
    return { ...job.state };
  }

  remove(id: string, owner: string) {
    const job = this.jobs.get(id);
    if (job?.owner === owner) {
      job.controller.abort();
      this.jobs.delete(id);
    }
  }

  close() {
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
  }
}
