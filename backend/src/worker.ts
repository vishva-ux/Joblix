import os from 'os';
import prisma from './db';
import parser from 'cron-parser';

const WORKER_ID = process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}`;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);
const POLL_INTERVAL = 1000; // 1 second
const HEARTBEAT_INTERVAL = 5000; // 5 seconds

let activeJobs = 0;
let isShuttingDown = false;
const activeExecutions = new Map<string, Promise<void>>();

console.log(`Starting Worker [${WORKER_ID}] with concurrency limit: ${CONCURRENCY}`);

// ==========================================
// 1. HEARTBEAT SYSTEM
// ==========================================
async function sendHeartbeat() {
  if (isShuttingDown) return;

  try {
    const cpuUsage = 10 + Math.random() * 20; // Simulated
    const memoryUsage = 40 + Math.random() * 10; // Simulated

    await prisma.worker.upsert({
      where: { id: WORKER_ID },
      update: {
        lastHeartbeat: new Date(),
        status: 'ACTIVE',
        concurrency: CONCURRENCY
      },
      create: {
        id: WORKER_ID,
        name: `Worker Node [${os.hostname()}]`,
        status: 'ACTIVE',
        concurrency: CONCURRENCY,
        lastHeartbeat: new Date()
      }
    });

    await prisma.workerHeartbeat.create({
      data: {
        workerId: WORKER_ID,
        cpuUsage,
        memoryUsage,
        activeJobs
      }
    });
  } catch (error) {
    console.error(`Worker [${WORKER_ID}] heartbeat failed:`, error);
  }
}

// Start heartbeats
const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

// ==========================================
// 2. ATOMIC CLAIMING & LIFE CYCLE
// ==========================================
async function claimJob() {
  if (isShuttingDown || activeJobs >= CONCURRENCY) return null;

  try {
    return await prisma.$transaction(async (tx) => {
      // Find eligible active queues
      const activeQueues = await tx.queue.findMany({
        where: { isPaused: false },
        select: { id: true, priority: true }
      });

      const queueIds = activeQueues.map(q => q.id);
      if (queueIds.length === 0) return null;

      // Find first queued job ready to run (sorted by Queue priority then oldest Job first)
      const jobCandidate = await tx.job.findFirst({
        where: {
          queueId: { in: queueIds },
          status: 'QUEUED',
          runAt: { lte: new Date() }
        },
        orderBy: [
          { queue: { priority: 'desc' } },
          { createdAt: 'asc' }
        ]
      });

      if (!jobCandidate) return null;

      // Atomically claim the job
      const claimedJob = await tx.job.update({
        where: { id: jobCandidate.id, status: 'QUEUED' },
        data: {
          status: 'CLAIMED',
          claimedById: WORKER_ID,
          claimedAt: new Date()
        },
        include: {
          queue: {
            include: {
              retryPolicies: true
            }
          }
        }
      });

      return claimedJob;
    });
  } catch (error) {
    // Transaction conflict/abort, expected under high concurrency, retry silently
    return null;
  }
}

// ==========================================
// 3. JOB EXECUTION ENGINE
// ==========================================
async function executeJob(job: any) {
  activeJobs++;
  const executionId = `exec-${job.id}-${Date.now()}`;

  const runPromise = (async () => {
    console.log(`[Job ${job.id}] Started execution on worker ${WORKER_ID}`);

    // Create execution record
    const execution = await prisma.jobExecution.create({
      data: {
        id: executionId,
        jobId: job.id,
        workerId: WORKER_ID,
        status: 'RUNNING',
        attempt: job.retryCount + 1,
        startedAt: new Date()
      }
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING' }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: `Attempt ${execution.attempt} started on worker ${WORKER_ID}.`
      }
    });

    try {
      const payload = JSON.parse(job.payload);
      // Simulated workloads based on Queue Name
      const queueName = job.queue.name;
      let durationMs = 1000;

      if (queueName === 'email-queue') {
        durationMs = 800 + Math.random() * 400;
        await new Promise(resolve => setTimeout(resolve, durationMs));
        
        // Random 10% failure simulation
        if (Math.random() < 0.1) {
          throw new Error('Smtp Connection timed out: smtp.mail.production.internal');
        }

        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: 'INFO',
            message: `SMTP: Dispatched mail to ${payload.email || 'user@example.com'} using template '${payload.template}'`
          }
        });

      } else if (queueName === 'image-processing') {
        durationMs = 1500 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, durationMs));

        // Random 15% failure simulation
        if (Math.random() < 0.15) {
          throw new Error('Prisma error: Disk I/O limit exceeded on image temp folder');
        }

        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: 'INFO',
            message: `IMAGE: Resized image ${payload.imageId || 'img.png'} to target size: ${payload.targetSize || '1024px'}`
          }
        });

      } else {
        // Default worker simulator
        durationMs = 2000;
        await new Promise(resolve => setTimeout(resolve, durationMs));
        
        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: 'INFO',
            message: `GENERIC: Processed background task with payload keys: [${Object.keys(payload).join(', ')}]`
          }
        });
      }

      // Success paths
      const resultObj = { success: true, processedAt: new Date(), worker: WORKER_ID };

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: JSON.stringify(resultObj)
        }
      });

      await prisma.jobExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          durationMs: Math.round(durationMs)
        }
      });

      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: 'INFO',
          message: `Job completed successfully in ${Math.round(durationMs)}ms.`
        }
      });

      // Handle Cron Recurring Rescheduling
      if (job.cronExpression) {
        try {
          const interval = parser.parseExpression(job.cronExpression);
          const nextRun = interval.next().toDate();

          // Create new scheduled Job
          const nextJob = await prisma.job.create({
            data: {
              queueId: job.queueId,
              status: 'SCHEDULED',
              payload: job.payload,
              cronExpression: job.cronExpression,
              runAt: nextRun,
              maxRetries: job.maxRetries
            }
          });

          console.log(`[Cron] Rescheduled next run for job [${job.id}] -> [${nextJob.id}] at ${nextRun.toISOString()}`);
        } catch (cronErr) {
          console.error(`Failed to reschedule cron job ${job.id}:`, cronErr);
        }
      }

    } catch (err: any) {
      const errorMsg = err.message || String(err);
      console.error(`[Job ${job.id}] Execution failed: ${errorMsg}`);

      await prisma.jobExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: errorMsg
        }
      });

      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: 'ERROR',
          message: `Job failed with error: ${errorMsg}`
        }
      });

      // Calculate Retries
      const attempt = job.retryCount + 1;
      const policy = job.queue.retryPolicies[0] || { strategy: 'LINEAR', maxRetries: 3, delayMs: 1000, multiplier: 2 };

      if (attempt < policy.maxRetries) {
        // Backoff Math
        let delay = policy.delayMs;
        if (policy.strategy === 'LINEAR') {
          delay = policy.delayMs * attempt;
        } else if (policy.strategy === 'EXPONENTIAL') {
          delay = policy.delayMs * Math.pow(policy.multiplier, attempt - 1);
        }

        const nextRun = new Date(Date.now() + delay);

        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            retryCount: attempt,
            runAt: nextRun,
            error: errorMsg
          }
        });

        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: 'WARN',
            message: `Retrying job. Attempt ${attempt} failed. Re-queued for ${nextRun.toISOString()} (backoff delay: ${delay}ms).`
          }
        });
      } else {
        // DLQ Exhaustion
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: errorMsg
          }
        });

        await prisma.deadLetterQueue.create({
          data: {
            jobId: job.id,
            queueId: job.queueId,
            reason: `Max retries (${policy.maxRetries}) exhausted. Final error: ${errorMsg}`,
            payload: job.payload
          }
        });

        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: 'ERROR',
            message: `Max retries exhausted. Moved to Dead Letter Queue.`
          }
        });
      }
    } finally {
      activeJobs--;
      activeExecutions.delete(job.id);
    }
  })();

  activeExecutions.set(job.id, runPromise);
}

// ==========================================
// 4. MAIN POLLING LOOP
// ==========================================
async function pollLoop() {
  if (isShuttingDown) return;

  if (activeJobs < CONCURRENCY) {
    const job = await claimJob();
    if (job) {
      // Execute without blocking the poll loop
      executeJob(job).catch(err => {
        console.error('Fatal error during executeJob orchestration:', err);
      });
    }
  }

  setTimeout(pollLoop, POLL_INTERVAL);
}

// Start polling
pollLoop();

// ==========================================
// 5. GRACEFUL SHUTDOWN
// ==========================================
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;
  clearInterval(heartbeatTimer);

  // Stop polling loop, wait for running executions
  console.log(`Waiting for ${activeExecutions.size} active jobs to complete...`);
  await Promise.all(Array.from(activeExecutions.values()));

  try {
    // Update Worker status to INACTIVE
    await prisma.worker.update({
      where: { id: WORKER_ID },
      data: { status: 'INACTIVE' }
    });
    console.log('Worker marked INACTIVE. Database connection closing.');
  } catch (err) {
    console.error('Error during worker cleanup:', err);
  } finally {
    await prisma.$disconnect();
    console.log('Shutdown finished. Exiting.');
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
