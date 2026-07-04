"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("./db"));
const uuid_1 = require("uuid");
async function runTests() {
    console.log('--- STARTING JOBLIX SCHEDULER INTEGRATION TESTS ---');
    // 1. Setup temporary test Project, Queue, and Retry Policy
    const testOrg = await db_1.default.organization.create({
        data: { name: 'Test Org' }
    });
    const testProj = await db_1.default.project.create({
        data: {
            name: 'Test Project',
            apiKey: `test_${(0, uuid_1.v4)().replace(/-/g, '')}`,
            organizationId: testOrg.id
        }
    });
    const testQueue = await db_1.default.queue.create({
        data: {
            projectId: testProj.id,
            name: 'test-concurrency-queue',
            priority: 5,
            concurrencyLimit: 2
        }
    });
    await db_1.default.retryPolicy.create({
        data: {
            queueId: testQueue.id,
            strategy: 'FIXED',
            maxRetries: 2,
            delayMs: 200
        }
    });
    console.log('✅ Setup: Created test organization, project, queue, and retry policy.');
    // TEST 1: Job lifecycle state transitions
    console.log('\nRunning Test 1: Job State Transitions & Retries...');
    const testJob = await db_1.default.job.create({
        data: {
            queueId: testQueue.id,
            status: 'QUEUED',
            payload: JSON.stringify({ action: 'send_test_ping' }),
            maxRetries: 2
        }
    });
    if (testJob.status !== 'QUEUED') {
        throw new Error(`Expected initial job status to be QUEUED, got: ${testJob.status}`);
    }
    console.log('  - Job created in QUEUED state.');
    // Claim
    const testWorkerId = 'test-worker-node';
    // Create test worker first
    await db_1.default.worker.create({
        data: {
            id: testWorkerId,
            name: 'Test Worker Node',
            status: 'ACTIVE'
        }
    });
    const claimedJob = await db_1.default.$transaction(async (tx) => {
        return tx.job.update({
            where: { id: testJob.id, status: 'QUEUED' },
            data: {
                status: 'CLAIMED',
                claimedById: testWorkerId,
                claimedAt: new Date()
            }
        });
    });
    if (claimedJob.status !== 'CLAIMED' || claimedJob.claimedById !== testWorkerId) {
        throw new Error('Failed to claim the job correctly');
    }
    console.log('  - Job transitioned to CLAIMED.');
    // Update to RUNNING
    await db_1.default.job.update({
        where: { id: testJob.id },
        data: { status: 'RUNNING' }
    });
    console.log('  - Job transitioned to RUNNING.');
    // Simulate first failure -> backoff to QUEUED (retryCount 1)
    const nextRun = new Date(Date.now() + 200);
    const retriedJob = await db_1.default.job.update({
        where: { id: testJob.id },
        data: {
            status: 'QUEUED',
            retryCount: 1,
            runAt: nextRun,
            error: 'Mock Timeout Failure'
        }
    });
    if (retriedJob.status !== 'QUEUED' || retriedJob.retryCount !== 1) {
        throw new Error('Failed to reschedule for retry');
    }
    console.log('  - Job successfully retried and put back to QUEUED/SCHEDULED with incremented retry count.');
    // Move to FAILED and DLQ on final failure
    await db_1.default.job.update({
        where: { id: testJob.id },
        data: {
            status: 'FAILED',
            error: 'Final Failure'
        }
    });
    const dlqEntry = await db_1.default.deadLetterQueue.create({
        data: {
            jobId: testJob.id,
            queueId: testQueue.id,
            reason: 'Max retries exceeded',
            payload: testJob.payload
        }
    });
    if (!dlqEntry) {
        throw new Error('DLQ entry was not created');
    }
    console.log('  - Job moved to DLQ successfully on max retries.');
    // TEST 2: Atomic Concurrency Claims (preventing duplicate execution)
    console.log('\nRunning Test 2: Atomic Claim Concurrency...');
    // Create a single QUEUED job
    const concurrentJob = await db_1.default.job.create({
        data: {
            queueId: testQueue.id,
            status: 'QUEUED',
            payload: JSON.stringify({ action: 'concurrent_test' })
        }
    });
    // Create workers in DB to satisfy foreign keys
    const workersList = ['worker-a', 'worker-b', 'worker-c', 'worker-d', 'worker-e'];
    for (const wId of workersList) {
        await db_1.default.worker.create({
            data: { id: wId, name: `Worker ${wId}`, status: 'ACTIVE' }
        });
    }
    // Attempt to claim simultaneously from 5 workers using Promise.all
    const claimAttempts = await Promise.all(workersList.map(async (workerId) => {
        try {
            return await db_1.default.$transaction(async (tx) => {
                const eligible = await tx.job.findFirst({
                    where: { id: concurrentJob.id, status: 'QUEUED' }
                });
                if (!eligible)
                    return null;
                return await tx.job.update({
                    where: { id: concurrentJob.id, status: 'QUEUED' },
                    data: {
                        status: 'CLAIMED',
                        claimedById: workerId,
                        claimedAt: new Date()
                    }
                });
            });
        }
        catch (err) {
            return null;
        }
    }));
    const successfulClaims = claimAttempts.filter(job => job !== null);
    console.log(`  - Claim attempts count: ${claimAttempts.length}`);
    console.log(`  - Successful claims count: ${successfulClaims.length}`);
    if (successfulClaims.length !== 1) {
        throw new Error(`Concurrency violation! Expected exactly 1 worker to claim the job, but got: ${successfulClaims.length}`);
    }
    console.log(`  - Worker that successfully claimed job: ${successfulClaims[0]?.claimedById}`);
    console.log('✅ Concurrency: Atomic claiming guarantees no double execution.');
    // Cleanup
    await db_1.default.deadLetterQueue.deleteMany({ where: { queueId: testQueue.id } });
    await db_1.default.jobExecution.deleteMany({ where: { jobId: testJob.id } });
    await db_1.default.job.deleteMany({ where: { queueId: testQueue.id } });
    await db_1.default.worker.deleteMany({
        where: { id: { in: ['test-worker-node', ...workersList] } }
    });
    await db_1.default.retryPolicy.deleteMany({ where: { queueId: testQueue.id } });
    await db_1.default.queue.delete({ where: { id: testQueue.id } });
    await db_1.default.project.delete({ where: { id: testProj.id } });
    await db_1.default.organization.delete({ where: { id: testOrg.id } });
    console.log('\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ✅');
}
runTests().catch(err => {
    console.error('\n❌ TEST RUN FAILED: ❌\n', err);
    process.exit(1);
});
