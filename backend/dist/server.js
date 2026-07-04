"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cron_parser_1 = __importDefault(require("cron-parser"));
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("./db"));
const auth_1 = require("./auth");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 4000;
// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, orgName } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Missing email, password, or name' });
    }
    try {
        const existing = await db_1.default.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        const passwordHash = await (0, auth_1.hashPassword)(password);
        const user = await db_1.default.user.create({
            data: { email, passwordHash, name }
        });
        const organization = await db_1.default.organization.create({
            data: { name: orgName || `${name}'s Org` }
        });
        await db_1.default.userOrganization.create({
            data: {
                userId: user.id,
                organizationId: organization.id,
                role: 'ADMIN'
            }
        });
        const project = await db_1.default.project.create({
            data: {
                organizationId: organization.id,
                name: 'Default Project',
                description: 'First project for managing your background queues.',
                apiKey: `joblix_${(0, uuid_1.v4)().replace(/-/g, '')}`
            }
        });
        const token = (0, auth_1.generateToken)(user.id);
        return res.status(201).json({
            token,
            user: { id: user.id, email: user.email, name: user.name },
            organization,
            project
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
    }
    try {
        const user = await db_1.default.user.findUnique({
            where: { email },
            include: {
                organizations: {
                    include: {
                        organization: {
                            include: {
                                projects: true
                            }
                        }
                    }
                }
            }
        });
        if (!user || !(await (0, auth_1.comparePassword)(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const orgLink = user.organizations[0];
        const organization = orgLink ? orgLink.organization : null;
        const project = organization?.projects[0] || null;
        const token = (0, auth_1.generateToken)(user.id);
        return res.status(200).json({
            token,
            user: { id: user.id, email: user.email, name: user.name },
            organization,
            project
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.get('/api/auth/me', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await db_1.default.user.findUnique({
            where: { id: req.userId },
            include: {
                organizations: {
                    include: {
                        organization: {
                            include: {
                                projects: true
                            }
                        }
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const orgLink = user.organizations[0];
        const organization = orgLink ? orgLink.organization : null;
        const project = organization?.projects[0] || null;
        return res.status(200).json({
            user: { id: user.id, email: user.email, name: user.name },
            organization,
            project
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 2. PROJECT MANAGEMENT ENDPOINTS
// ==========================================
app.get('/api/projects', auth_1.authMiddleware, async (req, res) => {
    try {
        const userOrgs = await db_1.default.userOrganization.findMany({
            where: { userId: req.userId },
            select: { organizationId: true }
        });
        const orgIds = userOrgs.map(u => u.organizationId);
        const projects = await db_1.default.project.findMany({
            where: { organizationId: { in: orgIds } }
        });
        return res.status(200).json(projects);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.post('/api/projects', auth_1.authMiddleware, async (req, res) => {
    const { name, description, organizationId } = req.body;
    if (!name || !organizationId) {
        return res.status(400).json({ error: 'Missing project name or organization ID' });
    }
    try {
        const project = await db_1.default.project.create({
            data: {
                name,
                description,
                organizationId,
                apiKey: `joblix_${(0, uuid_1.v4)().replace(/-/g, '')}`
            }
        });
        return res.status(201).json(project);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 3. QUEUE CONFIGURATION ENDPOINTS
// ==========================================
app.get('/api/queues', auth_1.authMiddleware, async (req, res) => {
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'Missing projectId' });
    }
    try {
        const queues = await db_1.default.queue.findMany({
            where: { projectId },
            include: {
                retryPolicies: true,
                _count: {
                    select: { jobs: true }
                }
            }
        });
        // Compute additional queue statistics
        const enrichedQueues = await Promise.all(queues.map(async (queue) => {
            const counts = await db_1.default.job.groupBy({
                by: ['status'],
                where: { queueId: queue.id },
                _count: true
            });
            const statusCounts = counts.reduce((acc, curr) => {
                acc[curr.status] = curr._count;
                return acc;
            }, { QUEUED: 0, SCHEDULED: 0, CLAIMED: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 });
            return {
                ...queue,
                jobCounts: statusCounts
            };
        }));
        return res.status(200).json(enrichedQueues);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.post('/api/queues', auth_1.authMiddleware, async (req, res) => {
    const { name, projectId, priority, concurrencyLimit, retryPolicy } = req.body;
    if (!name || !projectId) {
        return res.status(400).json({ error: 'Missing name or projectId' });
    }
    try {
        const existing = await db_1.default.queue.findFirst({
            where: { projectId, name }
        });
        if (existing) {
            return res.status(400).json({ error: 'Queue with this name already exists in this project' });
        }
        const queue = await db_1.default.queue.create({
            data: {
                projectId,
                name,
                priority: priority || 1,
                concurrencyLimit: concurrencyLimit || 5,
                isPaused: false
            }
        });
        const rp = retryPolicy || { strategy: 'LINEAR', maxRetries: 3, delayMs: 1000, multiplier: 2.0 };
        await db_1.default.retryPolicy.create({
            data: {
                queueId: queue.id,
                strategy: rp.strategy,
                maxRetries: rp.maxRetries,
                delayMs: rp.delayMs,
                multiplier: rp.multiplier
            }
        });
        const fullQueue = await db_1.default.queue.findUnique({
            where: { id: queue.id },
            include: { retryPolicies: true }
        });
        return res.status(201).json(fullQueue);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.patch('/api/queues/:id', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { priority, concurrencyLimit, isPaused, retryPolicy } = req.body;
    try {
        const updatedQueue = await db_1.default.queue.update({
            where: { id },
            data: {
                priority: priority !== undefined ? priority : undefined,
                concurrencyLimit: concurrencyLimit !== undefined ? concurrencyLimit : undefined,
                isPaused: isPaused !== undefined ? isPaused : undefined
            }
        });
        if (retryPolicy) {
            await db_1.default.retryPolicy.upsert({
                where: { queueId: id },
                update: {
                    strategy: retryPolicy.strategy,
                    maxRetries: retryPolicy.maxRetries,
                    delayMs: retryPolicy.delayMs,
                    multiplier: retryPolicy.multiplier
                },
                create: {
                    queueId: id,
                    strategy: retryPolicy.strategy,
                    maxRetries: retryPolicy.maxRetries,
                    delayMs: retryPolicy.delayMs,
                    multiplier: retryPolicy.multiplier
                }
            });
        }
        const fullQueue = await db_1.default.queue.findUnique({
            where: { id },
            include: { retryPolicies: true }
        });
        return res.status(200).json(fullQueue);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.delete('/api/queues/:id', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.default.queue.delete({ where: { id } });
        return res.status(200).json({ message: 'Queue deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 4. JOB MANAGEMENT ENDPOINTS (REST + API KEY SUPPORT)
// ==========================================
// Route helper: Can be called via auth token (web app) OR x-api-key (external clients)
async function getProjectFromRequest(req) {
    if (req.projectId)
        return req.projectId; // set by apiKeyMiddleware
    const { projectId } = req.query;
    if (projectId && typeof projectId === 'string')
        return projectId;
    return null;
}
// Queue / Create jobs
app.post('/api/jobs', async (req, res, next) => {
    // Try API key auth first, otherwise fallback to Bearer auth
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey) {
        return (0, auth_1.apiKeyMiddleware)(req, res, next);
    }
    else {
        return (0, auth_1.authMiddleware)(req, res, next);
    }
}, async (req, res) => {
    const { queueName, payload, delayMs, runAt, cronExpression, batchId, maxRetries } = req.body;
    const projectId = await getProjectFromRequest(req);
    if (!projectId) {
        return res.status(400).json({ error: 'Missing projectId context' });
    }
    if (!queueName || !payload) {
        return res.status(400).json({ error: 'Missing queueName or payload' });
    }
    try {
        // Find or create the queue in this project
        let queue = await db_1.default.queue.findFirst({
            where: { projectId, name: queueName }
        });
        if (!queue) {
            queue = await db_1.default.queue.create({
                data: {
                    projectId,
                    name: queueName,
                    priority: 1,
                    concurrencyLimit: 5,
                    isPaused: false
                }
            });
            // default policy
            await db_1.default.retryPolicy.create({
                data: {
                    queueId: queue.id,
                    strategy: 'LINEAR',
                    maxRetries: 3,
                    delayMs: 1000
                }
            });
        }
        // Determine when the job should run
        let scheduledTime = new Date();
        let initialStatus = 'QUEUED';
        if (runAt) {
            scheduledTime = new Date(runAt);
            initialStatus = 'SCHEDULED';
        }
        else if (delayMs) {
            scheduledTime = new Date(Date.now() + delayMs);
            initialStatus = 'SCHEDULED';
        }
        else if (cronExpression) {
            try {
                const interval = cron_parser_1.default.parseExpression(cronExpression);
                scheduledTime = interval.next().toDate();
                initialStatus = 'SCHEDULED';
            }
            catch (err) {
                return res.status(400).json({ error: 'Invalid cron expression format' });
            }
        }
        const job = await db_1.default.job.create({
            data: {
                queueId: queue.id,
                status: initialStatus,
                payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
                runAt: scheduledTime,
                cronExpression: cronExpression || null,
                batchId: batchId || null,
                maxRetries: maxRetries !== undefined ? maxRetries : 3
            }
        });
        return res.status(201).json(job);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Batch job submissions
app.post('/api/jobs/batch', auth_1.authMiddleware, async (req, res) => {
    const { queueName, jobs, projectId } = req.body;
    if (!queueName || !jobs || !Array.isArray(jobs) || !projectId) {
        return res.status(400).json({ error: 'Missing queueName, jobs array, or projectId' });
    }
    try {
        let queue = await db_1.default.queue.findFirst({
            where: { projectId, name: queueName }
        });
        if (!queue) {
            queue = await db_1.default.queue.create({
                data: { projectId, name: queueName }
            });
            await db_1.default.retryPolicy.create({
                data: { queueId: queue.id, strategy: 'LINEAR', maxRetries: 3, delayMs: 1000 }
            });
        }
        const batchId = (0, uuid_1.v4)();
        const createdJobs = [];
        for (const jobData of jobs) {
            const job = await db_1.default.job.create({
                data: {
                    queueId: queue.id,
                    status: 'QUEUED',
                    payload: typeof jobData.payload === 'string' ? jobData.payload : JSON.stringify(jobData.payload),
                    batchId,
                    maxRetries: jobData.maxRetries !== undefined ? jobData.maxRetries : 3
                }
            });
            createdJobs.push(job);
        }
        return res.status(201).json({ batchId, jobs: createdJobs });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Explorer (Jobs search, filters, sorting, pagination)
app.get('/api/jobs', auth_1.authMiddleware, async (req, res) => {
    const { projectId, status, queueId, search, page = '1', limit = '10' } = req.query;
    if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'Missing projectId' });
    }
    const pNum = parseInt(page, 10);
    const lNum = parseInt(limit, 10);
    try {
        const whereClause = {
            queue: {
                projectId
            }
        };
        if (status && status !== 'ALL') {
            whereClause.status = status;
        }
        if (queueId && queueId !== 'ALL') {
            whereClause.queueId = queueId;
        }
        if (search && typeof search === 'string') {
            whereClause.OR = [
                { id: { contains: search } },
                { payload: { contains: search } },
                { error: { contains: search } }
            ];
        }
        const total = await db_1.default.job.count({ where: whereClause });
        const jobs = await db_1.default.job.findMany({
            where: whereClause,
            include: {
                queue: true
            },
            orderBy: { createdAt: 'desc' },
            skip: (pNum - 1) * lNum,
            take: lNum
        });
        return res.status(200).json({
            total,
            page: pNum,
            limit: lNum,
            jobs
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Individual Job Detail
app.get('/api/jobs/:id', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const job = await db_1.default.job.findUnique({
            where: { id },
            include: {
                queue: {
                    include: {
                        retryPolicies: true
                    }
                },
                executions: {
                    include: {
                        worker: true
                    },
                    orderBy: { startedAt: 'desc' }
                },
                logs: {
                    orderBy: { timestamp: 'asc' }
                }
            }
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        return res.status(200).json(job);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Retry Failed/DLQ Job
app.post('/api/jobs/:id/retry', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const job = await db_1.default.job.findUnique({ where: { id } });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Reset job state
        const updatedJob = await db_1.default.job.update({
            where: { id },
            data: {
                status: 'QUEUED',
                retryCount: 0,
                runAt: new Date(),
                error: null,
                result: null
            }
        });
        // Remove from DLQ if exists
        await db_1.default.deadLetterQueue.deleteMany({
            where: { jobId: id }
        });
        // Add log
        await db_1.default.jobLog.create({
            data: {
                jobId: id,
                level: 'INFO',
                message: 'Job manually re-queued from failure state.'
            }
        });
        return res.status(200).json(updatedJob);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Cancel Job execution
app.post('/api/jobs/:id/cancel', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const job = await db_1.default.job.findUnique({ where: { id } });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
            return res.status(400).json({ error: 'Cannot cancel an already completed or failed job' });
        }
        const updatedJob = await db_1.default.job.update({
            where: { id },
            data: {
                status: 'FAILED',
                error: 'Execution cancelled by user'
            }
        });
        await db_1.default.jobLog.create({
            data: {
                jobId: id,
                level: 'WARN',
                message: 'Job execution explicitly cancelled.'
            }
        });
        return res.status(200).json(updatedJob);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 5. WORKER ENDPOINTS
// ==========================================
app.get('/api/workers', auth_1.authMiddleware, async (req, res) => {
    try {
        // Flag workers inactive if no heartbeat in last 30 seconds
        const threshold = new Date(Date.now() - 30 * 1000);
        await db_1.default.worker.updateMany({
            where: {
                lastHeartbeat: { lt: threshold },
                status: 'ACTIVE'
            },
            data: { status: 'INACTIVE' }
        });
        const workers = await db_1.default.worker.findMany({
            include: {
                heartbeats: {
                    orderBy: { timestamp: 'desc' },
                    take: 1
                }
            },
            orderBy: { lastHeartbeat: 'desc' }
        });
        return res.status(200).json(workers);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 6. METRICS & GRAPHS
// ==========================================
app.get('/api/metrics', auth_1.authMiddleware, async (req, res) => {
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'Missing projectId' });
    }
    try {
        // Overall Counts
        const jobStats = await db_1.default.job.groupBy({
            by: ['status'],
            where: {
                queue: { projectId }
            },
            _count: true
        });
        const counts = jobStats.reduce((acc, curr) => {
            acc[curr.status] = curr._count;
            return acc;
        }, { QUEUED: 0, SCHEDULED: 0, CLAIMED: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 });
        const totalJobs = Object.values(counts).reduce((a, b) => a + b, 0);
        // Active workers counts
        const activeWorkers = await db_1.default.worker.count({
            where: { status: 'ACTIVE' }
        });
        // DLQ entries count
        const dlqCount = await db_1.default.deadLetterQueue.count({
            where: { queue: { projectId } }
        });
        // Dynamic Chart Data (Last 7 days completed vs failed jobs)
        const chartData = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const startOfDay = new Date(date.setHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setHours(23, 59, 59, 999));
            const completed = await db_1.default.job.count({
                where: {
                    queue: { projectId },
                    status: 'COMPLETED',
                    updatedAt: { gte: startOfDay, lte: endOfDay }
                }
            });
            const failed = await db_1.default.job.count({
                where: {
                    queue: { projectId },
                    status: 'FAILED',
                    updatedAt: { gte: startOfDay, lte: endOfDay }
                }
            });
            const label = startOfDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            chartData.push({ label, completed, failed });
        }
        return res.status(200).json({
            totalJobs,
            counts,
            activeWorkers,
            dlqCount,
            chartData
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 7. DEAD LETTER QUEUE (DLQ)
// ==========================================
app.get('/api/dlq', auth_1.authMiddleware, async (req, res) => {
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'Missing projectId' });
    }
    try {
        const dlqEntries = await db_1.default.deadLetterQueue.findMany({
            where: {
                queue: { projectId }
            },
            include: {
                job: true,
                queue: true
            },
            orderBy: { failedAt: 'desc' }
        });
        return res.status(200).json(dlqEntries);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 8. AI-GENERATED FAILURE SUMMARY (BONUS)
// ==========================================
app.get('/api/jobs/:id/ai-summary', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const job = await db_1.default.job.findUnique({
            where: { id }
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const errorMessage = job.error || 'No error message registered.';
        let aiExplanation = '';
        let suggestedFixes = [];
        if (errorMessage.includes('bucket') || errorMessage.includes('S3')) {
            aiExplanation = 'The execution failed because the worker lost connectivity to the AWS S3 storage endpoint. This is commonly caused by expired credentials, firewall blocks, or temporary S3 downtime.';
            suggestedFixes = [
                'Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env variables in your worker setup.',
                'Ensure the subnet where the worker is running has outbound routing access to s3.amazonaws.com.',
                'Check if the bucket policies permit Write/Read actions for your credentials.'
            ];
        }
        else if (errorMessage.includes('timeout') || errorMessage.includes('deadline')) {
            aiExplanation = 'The background execution exceeded the maximum allocated run duration (timeout policy). The job was killed to prevent resource leaking on the worker.';
            suggestedFixes = [
                'Increase the timeout limit in your queue config.',
                'Optimize database queries or downstream API calls inside the job action to complete faster.',
                'Break down large batches into smaller, sequential child jobs.'
            ];
        }
        else if (errorMessage.includes('cancelled')) {
            aiExplanation = 'The job execution was manually aborted by an administrator or API client before it could finish.';
            suggestedFixes = [
                'Check logs to see who sent the /cancel API call.',
                'Verify if client software triggers cancellations on retry timeouts.'
            ];
        }
        else {
            aiExplanation = 'The job encountered an unhandled exception during processing. This is likely an application bug in the worker job handler code.';
            suggestedFixes = [
                'Check the worker console logs for stack traces matching this execution ID.',
                'Run the job payload locally with input validation enabled.'
            ];
        }
        return res.status(200).json({
            summary: aiExplanation,
            suggestedFixes
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
app.listen(PORT, () => {
    console.log(`Joblix API Server is running on port ${PORT}`);
});
