# Joblix: Design Decisions & Trade-Offs

This document outlines the engineering architecture, database design choices, and concurrency controls implemented in Joblix.

---

## 1. Concurrency Controls & Concurrency Safety

### The Problem
In a distributed environment with multiple workers polling the same queue database, the primary challenge is preventing **double claiming**—where Worker A and Worker B grab the same `QUEUED` job simultaneously.

### The Solution: Database Transactions (Optimistic/Pessimistic Locks)
Joblix implements an atomic claim routine inside a Prisma Transaction:
1. It queries the first `QUEUED` job ready to run (ordered by priority descending, then creation time ascending).
2. It immediately updates its status to `CLAIMED` and sets `claimedById` to the unique worker string inside the same transaction.
3. Because SQLite enforces immediate locking during write transactions, this operation is serialized. Other workers polling concurrently receive a transaction failure or notice the job is no longer `QUEUED`, causing them to retrying polling safely. This model scale-ports to PostgreSQL (`SELECT ... FOR UPDATE SKIP LOCKED`).

---

## 2. Database Normalization & Performance Choices

### Primary & Foreign Keys
* **UUIDs**: Used as primary keys across all tables to ensure unique identifiers in distributed systems (preventing ID collisions when merging database shards or syncing metrics).
* **OnDelete: Cascade**: Configured for relationships like `Project -> Queue -> Job -> JobExecution`. If a queue is deleted, all dependent jobs, logs, and executions are swept automatically by the engine, keeping the database clean.
* **OnDelete: SetNull**: Applied on `Worker -> Job` mapping. If a worker process dies and its record is garbage collected, the job retains its history but releases the worker association.

### Index Optimization
Performance bottlenecks in job schedulers typically occur during polling. To maintain sub-millisecond polling, we created composite indexes:
1. `Job([queueId, status, runAt])`: Minimizes lookup scans during worker queries.
2. `WorkerHeartbeat([workerId, timestamp])`: Speeds up computing worker health trends and active nodes.
3. `Job([status])`: Speeds up high-frequency aggregates shown on the Overview metrics cards.

---

## 3. Worker Graceful Shutdown Design

If a worker is restarted or terminated (e.g. during a Docker deploy), jobs mid-execution could get corrupted or stuck in `RUNNING` status permanently.
* **Signal Handlers**: Joblix listens for termination signals `SIGINT` and `SIGTERM`.
* **State Preservation**: Upon receiving a signal, the worker terminates the poll loop immediately, preventing any new jobs from being claimed.
* **Active Wait**: It waits for active executions to complete cleanly (via `Promise.all`), updates their database state to `COMPLETED`/`FAILED`, and finally marks itself `INACTIVE` in the worker registry before exiting.

---

## 4. Key Trade-Offs

### Relational Database vs. Redis (In-Memory Key-Value)
* **Redis (Celery/BullMQ)** is faster but volatile. In the event of a power loss, complex state persistence is harder to guarantee without AOF/RDB configuration.
* **Relational DB (Joblix/Hangfire)** allows transaction guarantees, complex multi-column index filters, simple relational links between jobs, and easy joins to worker metrics. We chose SQLite/Relational DB to prioritize reliability, auditing visibility, and structured logging.
