import prisma from './db';
import { hashPassword } from './auth';

async function main() {
  console.log('Seeding database...');

  // Clean old data
  await prisma.deadLetterQueue.deleteMany({});
  await prisma.jobLog.deleteMany({});
  await prisma.jobExecution.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.retryPolicy.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.userOrganization.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.workerHeartbeat.deleteMany({});
  await prisma.worker.deleteMany({});

  // 1. Create User
  const passwordHash = await hashPassword('admin123');
  const user = await prisma.user.create({
    data: {
      email: 'admin@joblix.com',
      passwordHash,
      name: 'Vishva Kanna',
    },
  });

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Acme Corporation',
    },
  });

  // 3. User Organization link
  await prisma.userOrganization.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: 'ADMIN',
    },
  });

  // 4. Create Project
  const project = await prisma.project.create({
    data: {
      name: 'Production Core Services',
      description: 'Primary project containing all business-critical worker queues.',
      apiKey: 'joblix_live_proj_api_key_xyz_998877',
      organizationId: org.id,
    },
  });

  // 5. Create Queues
  const queues = [
    { name: 'email-queue', priority: 3, concurrencyLimit: 4 },
    { name: 'image-processing', priority: 2, concurrencyLimit: 8 },
    { name: 'report-generation', priority: 1, concurrencyLimit: 2 },
  ];

  const dbQueues = [];
  for (const q of queues) {
    const queue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: q.name,
        priority: q.priority,
        concurrencyLimit: q.concurrencyLimit,
        isPaused: false,
      },
    });
    dbQueues.push(queue);

    // Create Retry Policy for this queue
    await prisma.retryPolicy.create({
      data: {
        queueId: queue.id,
        strategy: q.name === 'email-queue' ? 'EXPONENTIAL' : 'LINEAR',
        maxRetries: 3,
        delayMs: q.name === 'email-queue' ? 2000 : 1000,
        multiplier: 2.0,
      },
    });
  }

  // 6. Create Workers
  const worker1 = await prisma.worker.create({
    data: {
      id: 'worker-1',
      name: 'Worker Node Alpha (Docker-US)',
      status: 'ACTIVE',
      concurrency: 5,
    },
  });

  const worker2 = await prisma.worker.create({
    data: {
      id: 'worker-2',
      name: 'Worker Node Beta (BareMetal-EU)',
      status: 'ACTIVE',
      concurrency: 5,
    },
  });

  // Worker heartbeats
  for (const worker of [worker1, worker2]) {
    await prisma.workerHeartbeat.create({
      data: {
        workerId: worker.id,
        cpuUsage: 25.5 + Math.random() * 10,
        memoryUsage: 45.2 + Math.random() * 15,
        activeJobs: 2,
      },
    });
  }

  // 7. Create Jobs
  const emailQueue = dbQueues.find(q => q.name === 'email-queue')!;
  const imageQueue = dbQueues.find(q => q.name === 'image-processing')!;
  const reportQueue = dbQueues.find(q => q.name === 'report-generation')!;

  // Jobs - COMPLETED
  for (let i = 0; i < 15; i++) {
    const job = await prisma.job.create({
      data: {
        queueId: emailQueue.id,
        status: 'COMPLETED',
        payload: JSON.stringify({ userId: `user-${100 + i}`, template: 'welcome_email', email: `user${i}@example.com` }),
        result: JSON.stringify({ sent: true, provider: 'SendGrid', messageId: `msg-${Math.random()}` }),
        runAt: new Date(Date.now() - (i + 1) * 3600 * 1000),
        createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000),
      },
    });

    const execution = await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId: worker1.id,
        status: 'COMPLETED',
        attempt: 1,
        startedAt: new Date(job.createdAt.getTime()),
        finishedAt: new Date(job.createdAt.getTime() + 850),
        durationMs: 850,
      },
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: `Attempt 1: Sending welcome email to user${i}@example.com`,
        timestamp: job.createdAt,
      },
    });
    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: `Attempt 1: Welcome email successfully dispatched via SendGrid.`,
        timestamp: new Date(job.createdAt.getTime() + 800),
      },
    });
  }

  // Jobs - FAILED / DLQ
  const failedJob = await prisma.job.create({
    data: {
      queueId: imageQueue.id,
      status: 'FAILED',
      payload: JSON.stringify({ imageId: 'img-9988.png', compress: true, targetSize: '2MB' }),
      error: 'Error: Connection lost with storage bucket bucket-s3-prod.',
      runAt: new Date(Date.now() - 30 * 60 * 1000),
      retryCount: 3,
      maxRetries: 3,
      createdAt: new Date(Date.now() - 35 * 60 * 1000),
    },
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    await prisma.jobExecution.create({
      data: {
        jobId: failedJob.id,
        workerId: worker2.id,
        status: 'FAILED',
        attempt,
        startedAt: new Date(failedJob.createdAt.getTime() + attempt * 5 * 60 * 1000),
        finishedAt: new Date(failedJob.createdAt.getTime() + attempt * 5 * 60 * 1000 + 400),
        error: 'Error: Connection lost with storage bucket bucket-s3-prod.',
        durationMs: 400,
      },
    });
  }

  await prisma.jobLog.create({
    data: {
      jobId: failedJob.id,
      level: 'ERROR',
      message: 'Failed to access storage bucket: S3 connection timeout after 3 retries.',
    },
  });

  await prisma.deadLetterQueue.create({
    data: {
      jobId: failedJob.id,
      queueId: imageQueue.id,
      reason: 'Max retries exhausted. Failed with: S3 connection timeout.',
      payload: failedJob.payload,
    },
  });

  // Jobs - QUEUED
  await prisma.job.create({
    data: {
      queueId: emailQueue.id,
      status: 'QUEUED',
      payload: JSON.stringify({ userId: 'user-777', template: 'marketing_newsletter_weekly' }),
      createdAt: new Date(),
    },
  });

  // Jobs - SCHEDULED
  await prisma.job.create({
    data: {
      queueId: reportQueue.id,
      status: 'SCHEDULED',
      payload: JSON.stringify({ reportType: 'quarterly_financials_q2_2026' }),
      runAt: new Date(Date.now() + 2 * 3600 * 1000), // run in 2 hours
      createdAt: new Date(),
    },
  });

  // Jobs - RECURRING (cron)
  await prisma.job.create({
    data: {
      queueId: reportQueue.id,
      status: 'SCHEDULED',
      cronExpression: '0 0 * * *', // every day at midnight
      payload: JSON.stringify({ reportType: 'daily_active_users_summary' }),
      runAt: new Date(Date.now() + 60 * 1000),
      createdAt: new Date(),
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
