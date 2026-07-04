import React, { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  Clock,
  Cpu,
  RefreshCw,
  Play,
  Pause,
  AlertTriangle,
  Plus,
  Search,
  BookOpen,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  Calendar,
  Layers3,
  Key,
  Shield,
  Zap,
  Repeat,
  ArrowRight
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('joblix_token'));
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [project, setProject] = useState<any>(null);

  // Form states
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'landing'>('landing');
  const [email, setEmail] = useState('admin@joblix.com');
  const [password, setPassword] = useState('admin123');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Dashboard active view
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'queues' | 'jobs' | 'workers' | 'dlq'>('overview');

  // Relational data state
  const [queues, setQueues] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [dlqEntries, setDlqEntries] = useState<any[]>([]);

  // Explorer states
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobStatusFilter, setJobStatusFilter] = useState('ALL');
  const [jobQueueFilter, setJobQueueFilter] = useState('ALL');
  const [jobSearch, setJobSearch] = useState('');
  const [jobPage, setJobPage] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<any>(null);

  // Modal states
  const [showCreateQueueModal, setShowCreateQueueModal] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueuePriority, setNewQueuePriority] = useState(1);
  const [newQueueConcurrency, setNewQueueConcurrency] = useState(5);

  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [jobQueueName, setJobQueueName] = useState('');
  const [jobPayload, setJobPayload] = useState('{\n  "action": "send_alert",\n  "email": "user@domain.com"\n}');
  const [jobDelayMs, setJobDelayMs] = useState('');
  const [jobRunAt, setJobRunAt] = useState('');
  const [jobCron, setJobCron] = useState('');
  const [jobMaxRetries, setJobMaxRetries] = useState(3);
  const [jobType, setJobType] = useState<'immediate' | 'delayed' | 'scheduled' | 'cron'>('immediate');

  // Load user data on startup
  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token]);

  // Main polling loop for real-time dashboard updates
  useEffect(() => {
    if (!token || !project) return;

    fetchDashboardData();

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 4000);

    return () => clearInterval(interval);
  }, [token, project, activeTab, jobStatusFilter, jobQueueFilter, jobSearch, jobPage]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setOrganization(data.organization);
        setProject(data.project);
        setAuthMode('login'); // reset landing state once logged in
      } else {
        handleLogout();
      }
    } catch (e) {
      handleLogout();
    }
  };

  const fetchDashboardData = async () => {
    if (!project) return;
    try {
      // 1. Queues
      const qRes = await fetch(`${API_BASE}/queues?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (qRes.ok) setQueues(await qRes.json());

      // 2. Metrics
      const mRes = await fetch(`${API_BASE}/metrics?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (mRes.ok) setMetrics(await mRes.json());

      // 3. Workers
      const wRes = await fetch(`${API_BASE}/workers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (wRes.ok) setWorkers(await wRes.json());

      // 4. DLQ Entries
      const dRes = await fetch(`${API_BASE}/dlq?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (dRes.ok) setDlqEntries(await dRes.json());

      // 5. Jobs Explorer
      const jRes = await fetch(
        `${API_BASE}/jobs?projectId=${project.id}&status=${jobStatusFilter}&queueId=${jobQueueFilter}&search=${jobSearch}&page=${jobPage}&limit=8`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (jRes.ok) {
        const jData = await jRes.json();
        setJobs(jData.jobs);
        setJobTotal(jData.total);
      }
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('joblix_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setOrganization(data.organization);
        setProject(data.project);
      } else {
        setErrorMsg(data.error || 'Login failed');
      }
    } catch (err) {
      setErrorMsg('Server connection failed');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, orgName })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('joblix_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setOrganization(data.organization);
        setProject(data.project);
      } else {
        setErrorMsg(data.error || 'Registration failed');
      }
    } catch (err) {
      setErrorMsg('Server connection failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('joblix_token');
    setToken(null);
    setUser(null);
    setOrganization(null);
    setProject(null);
    setAuthMode('landing');
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/queues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newQueueName,
          projectId: project.id,
          priority: newQueuePriority,
          concurrencyLimit: newQueueConcurrency
        })
      });
      if (res.ok) {
        setShowCreateQueueModal(false);
        setNewQueueName('');
        fetchDashboardData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create queue');
      }
    } catch (err) {
      alert('Error creating queue');
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(jobPayload);
      } catch (err) {
        alert('Invalid JSON in payload');
        return;
      }

      const body: any = {
        queueName: jobQueueName || queues[0]?.name,
        payload: parsedPayload,
        maxRetries: jobMaxRetries
      };

      if (jobType === 'delayed' && jobDelayMs) {
        body.delayMs = parseInt(jobDelayMs, 10);
      } else if (jobType === 'scheduled' && jobRunAt) {
        body.runAt = new Date(jobRunAt).toISOString();
      } else if (jobType === 'cron' && jobCron) {
        body.cronExpression = jobCron;
      }

      const res = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...body, projectId: project.id })
      });

      if (res.ok) {
        setShowCreateJobModal(false);
        setJobDelayMs('');
        setJobRunAt('');
        setJobCron('');
        fetchDashboardData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to queue job');
      }
    } catch (err) {
      alert('Error queuing job');
    }
  };

  const toggleQueuePaused = async (qId: string, currentStatus: boolean) => {
    try {
      await fetch(`${API_BASE}/queues/${qId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isPaused: !currentStatus })
      });
      fetchDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedJob(null);
        setAiSummary(null);
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedJob(null);
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const viewJobDetails = async (job: any) => {
    setSelectedJob(job);
    setAiSummary(null);
    try {
      const res = await fetch(`${API_BASE}/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const detailedJob = await res.json();
        setSelectedJob(detailedJob);

        if (detailedJob.status === 'FAILED') {
          const aiRes = await fetch(`${API_BASE}/jobs/${job.id}/ai-summary`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (aiRes.ok) {
            setAiSummary(await aiRes.json());
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // LANDING PAGE & AUTH RENDER (if not logged in)
  // ==========================================
  if (!token) {
    if (authMode === 'landing') {
      return (
        <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="logo-icon" style={{ width: 38, height: 38, fontSize: 18 }}>J</div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Joblix</h1>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <a href="https://github.com/vishva-ux/Joblix" target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg> GitHub
              </a>
              <button className="btn btn-secondary" style={{ padding: '8px 16px' }} onClick={() => setAuthMode('login')}>Sign In</button>
              <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => setAuthMode('register')}>Get Started</button>
            </div>
          </header>

          {/* Hero Section */}
          <section style={{ padding: '80px 40px', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(79, 70, 229, 0.06)', border: '1px solid rgba(79, 70, 229, 0.15)', padding: '6px 16px', borderRadius: 99, fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 24 }}>
              <Sparkles size={14} /> Production-Grade Background Processing
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15, letterSpacing: '-1px', marginBottom: 20 }}>
              Distributed Job Scheduling <br />
              <span style={{ background: 'linear-gradient(135deg, var(--primary), var(--info))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>For Modern Web Applications</span>
            </h2>
            <p style={{ fontSize: 18, color: 'var(--text-secondary)', maxWidth: 640, margin: '0 auto 32px auto', lineHeight: 1.5 }}>
              Reliably enqueue immediate, delayed, batch, and recurring cron jobs. Orchestrated with concurrent execution pools, backoffs, and dead letter fallback.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }} onClick={() => setAuthMode('register')}>
                Deploy Cluster Free <ArrowRight size={16} />
              </button>
              <a href="https://github.com/vishva-ux/Joblix" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '12px 28px', fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                View Source Code
              </a>
            </div>
          </section>

          {/* Features Grid */}
          <section style={{ backgroundColor: 'white', padding: '80px 40px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 48 }}>Engineered For Extreme Concurrency</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
                <div style={{ border: '1px solid #f1f5f9', padding: 24, borderRadius: 12, backgroundColor: '#f8fafc' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(79, 70, 229, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', marginBottom: 16 }}>
                    <Shield size={20} />
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Atomic Job Claiming</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Serialized database transactions with compare-and-swap state validations ensure no double execution across worker pods.</p>
                </div>

                <div style={{ border: '1px solid #f1f5f9', padding: 24, borderRadius: 12, backgroundColor: '#f8fafc' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', marginBottom: 16 }}>
                    <Zap size={20} />
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Multi-Strategy Retries</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Configure Linear or Exponential backoffs per queue. Automatically quarantine dead runs to the Dead Letter Queue.</p>
                </div>

                <div style={{ border: '1px solid #f1f5f9', padding: 24, borderRadius: 12, backgroundColor: '#f8fafc' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(14, 165, 233, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--info)', marginBottom: 16 }}>
                    <Repeat size={20} />
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Native Cron Engines</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Register background tasks using standard UNIX cron expressions. Schedule calculations are parsed dynamically at runtime.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Console Preview Code Section */}
          <section style={{ padding: '80px 40px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', textAlign: 'center', fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Simple HTTP Trigger APIs</h3>
            <div style={{ backgroundColor: '#0f172a', padding: 24, borderRadius: 12, border: '1px solid #1e293b', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13, overflowX: 'auto', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ color: '#64748b', marginBottom: 12 }}># Submit an immediate background task via curl</div>
              <div>curl -X POST http://localhost:4000/api/jobs \</div>
              <div>  -H <span style={{ color: '#38bdf8' }}>"x-api-key: joblix_live_proj_api_key"</span> \</div>
              <div>  -H <span style={{ color: '#38bdf8' }}>"Content-Type: application/json"</span> \</div>
              <div>  -d '<span style={{ color: '#34d399' }}>{"{"} "queueName": "email-queue", "payload": {"{"} "userId": "789" {"}"} {"}"}</span>'</div>
              <div style={{ color: '#64748b', margin: '16px 0 8px 0' }}># Returns immediate job state acknowledgment</div>
              <div style={{ color: '#94a3b8' }}>{"{"} "id": "job-d8f99e", "status": "QUEUED", "runAt": "2026-07-04T11:03:00Z" {"}"}</div>
            </div>
          </section>

          {/* Footer */}
          <footer style={{ marginTop: 'auto', padding: 24, textAlign: 'center', borderTop: '1px solid #e2e8f0', backgroundColor: 'white', fontSize: 12, color: 'var(--text-secondary)' }}>
            Joblix distributed orchestration scheduling engine. MIT Licensed. Created for tech round assessment.
          </footer>
        </div>
      );
    }

    return (
      <div className="auth-container">
        <div className="auth-card">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div className="logo-icon" style={{ width: 48, height: 48, fontSize: 24 }}>J</div>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: 6, fontWeight: 700 }}>
            {authMode === 'login' ? 'Welcome back' : 'Create Account'}
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 30 }}>
            {authMode === 'login' ? 'Log in to manage background workers' : 'Register a new scheduler node'}
          </p>

          {errorMsg && (
            <div style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)', padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 20, border: '1px solid var(--danger-border)' }}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
            {authMode === 'register' && (
              <>
                <div className="form-group">
                  <label>Full Name</label>
                  <input className="form-control" type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Organization Name</label>
                  <input className="form-control" type="text" placeholder="Acme Inc." value={orgName} onChange={e => setOrgName(e.target.value)} required />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <input className="form-control" type="email" placeholder="you@domain.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input className="form-control" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: 10 }}>
              {authMode === 'login' ? 'Sign In' : 'Get Started'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
            {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
            <span style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? 'Sign up' : 'Sign in'}
            </span>
          </p>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setAuthMode('landing')}>
            ← Back to Homepage
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">J</div>
          <div className="logo-text">
            <h1>Joblix</h1>
            <span>Distributed Scheduler</span>
          </div>
        </div>

        {organization && (
          <div className="workspace-selector">
            <span className="workspace-label">Organization</span>
            <div className="workspace-name">{organization.name}</div>
          </div>
        )}

        <nav className="nav-menu">
          <div className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => { setActiveTab('overview'); setSelectedJob(null); }}>
            <Activity className="nav-icon" /> Overview
          </div>
          <div className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => { setActiveTab('projects'); setSelectedJob(null); }}>
            <BookOpen className="nav-icon" /> Projects
          </div>
          <div className={`nav-item ${activeTab === 'queues' ? 'active' : ''}`} onClick={() => { setActiveTab('queues'); setSelectedJob(null); }}>
            <Layers className="nav-icon" /> Queues
          </div>
          <div className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`} onClick={() => { setActiveTab('jobs'); setSelectedJob(null); }}>
            <Clock className="nav-icon" /> Jobs Explorer
          </div>
          <div className={`nav-item ${activeTab === 'workers' ? 'active' : ''}`} onClick={() => { setActiveTab('workers'); setSelectedJob(null); }}>
            <Cpu className="nav-icon" /> Workers
          </div>
          <div className={`nav-item ${activeTab === 'dlq' ? 'active' : ''}`} onClick={() => { setActiveTab('dlq'); setSelectedJob(null); }}>
            <AlertTriangle className="nav-icon" /> Dead Letter Queue
          </div>
        </nav>

        {user && (
          <div className="user-profile">
            <div className="user-avatar">{user.name.split(' ').map((n: string) => n[0]).join('')}</div>
            <div className="user-details">
              <div className="user-name">{user.name}</div>
              <div className="user-role">System Admin</div>
            </div>
            <button className="btn-logout" onClick={handleLogout} title="Log Out">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* MAIN CONTENT COMPONENT */}
      <main className="main-content">
        <header className="top-header">
          <div className="page-title">
            <h2>
              {activeTab === 'overview' && 'System Health & Metrics'}
              {activeTab === 'projects' && 'Project Configuration'}
              {activeTab === 'queues' && 'Background Queue Config'}
              {activeTab === 'jobs' && 'Distributed Jobs Explorer'}
              {activeTab === 'workers' && 'Active Worker Nodes'}
              {activeTab === 'dlq' && 'Dead Letter Queue (DLQ)'}
            </h2>
            <p>
              {activeTab === 'overview' && 'Real-time overview of your tasks execution and worker nodes.'}
              {activeTab === 'projects' && 'Manage security credentials, API keys, and configurations.'}
              {activeTab === 'queues' && 'Modify concurrency boundaries, priorities, and pause states.'}
              {activeTab === 'jobs' && 'Search executing payloads, analyze system stack traces, and trigger manual retries.'}
              {activeTab === 'workers' && 'Monitor container statistics, memory layouts, and heartbeats.'}
              {activeTab === 'dlq' && 'Permanent execution errors isolated for troubleshooting.'}
            </p>
          </div>

          <div className="header-actions">
            <div className="date-badge">
              <Calendar size={14} />
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
            <button className="btn btn-primary" onClick={() => {
              if (queues.length === 0) {
                alert('Please create a queue first!');
                return;
              }
              setJobQueueName(queues[0]?.name || '');
              setShowCreateJobModal(true);
            }}>
              <Plus size={16} /> Create Job
            </button>
          </div>
        </header>

        {/* ========================================== */}
        {/* VIEW: OVERVIEW (DASHBOARD) */}
        {/* ========================================== */}
        {activeTab === 'overview' && metrics && (
          <>
            <section className="card-grid">
              <div className="card">
                <div className="card-header-flex">
                  <span className="card-title">Total Job Runs</span>
                  <div className="card-icon" style={{ backgroundColor: '#e0e7ff', color: 'var(--primary)' }}>
                    <Layers3 size={20} />
                  </div>
                </div>
                <div className="card-value">{metrics.totalJobs}</div>
                <div className="card-trend up">
                  <span>+12.5%</span> from last 7 days
                </div>
              </div>

              <div className="card">
                <div className="card-header-flex">
                  <span className="card-title">Completed Runs</span>
                  <div className="card-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                    <Activity size={20} />
                  </div>
                </div>
                <div className="card-value">{metrics.counts.COMPLETED}</div>
                <div className="card-trend up">
                  <span>+15.2%</span> completion rate
                </div>
              </div>

              <div className="card">
                <div className="card-header-flex">
                  <span className="card-title">Active Workers</span>
                  <div className="card-icon" style={{ backgroundColor: 'var(--info-light)', color: 'var(--info)' }}>
                    <Cpu size={20} />
                  </div>
                </div>
                <div className="card-value">{metrics.activeWorkers}</div>
                <div className="card-trend" style={{ color: 'var(--text-secondary)' }}>
                  <span>{workers.filter(w => w.status === 'ACTIVE').length} nodes online</span>
                </div>
              </div>

              <div className="card">
                <div className="card-header-flex">
                  <span className="card-title">DLQ Incidents</span>
                  <div className="card-icon" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
                    <AlertTriangle size={20} />
                  </div>
                </div>
                <div className="card-value">{metrics.dlqCount}</div>
                <div className="card-trend down">
                  <span>-8.4%</span> failures this week
                </div>
              </div>
            </section>

            <div className="dashboard-row">
              {/* Job throughput SVG chart */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3>Throughput (Last 7 Days)</h3>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--success)' }}></span> Completed
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--danger)' }}></span> Failed
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 180, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '10px 0' }}>
                  {metrics.chartData.map((day: any, idx: number) => {
                    const maxVal = Math.max(...metrics.chartData.map((d: any) => d.completed + d.failed), 10);
                    const compHeight = (day.completed / maxVal) * 120;
                    const failHeight = (day.failed / maxVal) * 120;

                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                          <div style={{ width: 14, height: compHeight || 2, backgroundColor: 'var(--success)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} title={`Completed: ${day.completed}`} />
                          <div style={{ width: 14, height: failHeight || 2, backgroundColor: 'var(--danger)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} title={`Failed: ${day.failed}`} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status breakdown SVG donut */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3>Jobs by Status</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, justifyContent: 'center', height: '100%' }}>
                  <svg width="120" height="120" viewBox="0 0 42 42">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                    {(() => {
                      const total = metrics.totalJobs || 1;
                      const pComp = (metrics.counts.COMPLETED / total) * 100;
                      const pFail = (metrics.counts.FAILED / total) * 100;
                      const pRunning = (metrics.counts.RUNNING / total) * 100;

                      return (
                        <>
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--success)" strokeWidth="4"
                            strokeDasharray={`${pComp} ${100 - pComp}`} strokeDashoffset="25" />
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--danger)" strokeWidth="4"
                            strokeDasharray={`${pFail} ${100 - pFail}`} strokeDashoffset={25 - pComp} />
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--info)" strokeWidth="4"
                            strokeDasharray={`${pRunning} ${100 - pRunning}`} strokeDashoffset={25 - pComp - pFail} />
                        </>
                      );
                    })()}
                    <g className="chart-text">
                      <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" style={{ fontSize: 6, fontWeight: 700, fill: 'var(--text-primary)' }}>
                        {metrics.totalJobs}
                      </text>
                    </g>
                  </svg>
                  <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10, justifyContent: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)' }} /> Comp: {metrics.counts.COMPLETED}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--danger)' }} /> Fail: {metrics.counts.FAILED}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--info)' }} /> Run: {metrics.counts.RUNNING}</span>
                  </div>
                </div>
              </div>

              {/* System Health */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3>System Health</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Queue Health</span>
                    <span className="badge badge-completed">Healthy</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Worker Health</span>
                    <span className="badge badge-completed">Healthy</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>SQLite Database</span>
                    <span className="badge badge-completed">Connected</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>CPU Usage</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {(workers.reduce((acc, w) => acc + (w.heartbeats[0]?.cpuUsage || 0), 0) / (workers.length || 1)).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Memory Usage</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {(workers.reduce((acc, w) => acc + (w.heartbeats[0]?.memoryUsage || 0), 0) / (workers.length || 1)).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard Bottom Row: Queues and Workers Lists */}
            <div className="dashboard-row-2">
              <div className="table-container">
                <div style={{ padding: 18, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>Recent Queue Stats</h3>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setActiveTab('queues')}>View All</button>
                </div>
                <table className="table-dashboard">
                  <thead>
                    <tr>
                      <th>Queue Name</th>
                      <th>Priority</th>
                      <th>Running</th>
                      <th>Queued</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queues.slice(0, 5).map(q => (
                      <tr key={q.id}>
                        <td style={{ fontWeight: 600 }}>{q.name}</td>
                        <td>{q.priority}</td>
                        <td style={{ color: 'var(--info)', fontWeight: 600 }}>{q.jobCounts.RUNNING}</td>
                        <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{q.jobCounts.QUEUED}</td>
                        <td>
                          <span className={`badge ${q.isPaused ? 'badge-failed' : 'badge-completed'}`}>
                            {q.isPaused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-container">
                <div style={{ padding: 18, borderBottom: '1px solid var(--border-color)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>Worker Nodes Status</h3>
                </div>
                <table className="table-dashboard">
                  <thead>
                    <tr>
                      <th>Worker Name</th>
                      <th>Status</th>
                      <th>Active Jobs</th>
                      <th>Last Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map(w => (
                      <tr key={w.id}>
                        <td>
                          <span style={{ fontWeight: 600, display: 'block' }}>{w.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ID: {w.id}</span>
                        </td>
                        <td>
                          <span className={`badge ${w.status === 'ACTIVE' ? 'badge-completed' : 'badge-failed'}`}>
                            {w.status === 'ACTIVE' ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{w.heartbeats[0]?.activeJobs || 0} / {w.concurrency}</td>
                        <td>{new Date(w.lastHeartbeat).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ========================================== */}
        {/* VIEW: PROJECTS */}
        {/* ========================================== */}
        {activeTab === 'projects' && project && (
          <div className="card" style={{ maxWidth: 650 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 16 }}>Credentials & Settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
                <span className="workspace-label">Project Name</span>
                <span style={{ fontSize: 16, fontWeight: 700, display: 'block', marginTop: 4 }}>{project.name}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{project.description}</span>
              </div>

              <div>
                <span className="workspace-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Key size={12} /> REST API Credentials Key
                </span>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Pass this key via the <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>x-api-key</code> HTTP header to submit background jobs from exterior web applications.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input type="text" readOnly className="form-control" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--primary)' }} value={project.apiKey} />
                  <button className="btn btn-secondary" onClick={() => {
                    navigator.clipboard.writeText(project.apiKey);
                    alert('API Key copied to clipboard!');
                  }}>Copy Key</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW: QUEUES */}
        {/* ========================================== */}
        {activeTab === 'queues' && (
          <>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setShowCreateQueueModal(true)}>
                <Plus size={16} /> Create Queue
              </button>
            </div>

            <div className="table-container">
              <table className="table-dashboard">
                <thead>
                  <tr>
                    <th>Queue Name</th>
                    <th>Default Priority</th>
                    <th>Concurrency Boundary Limit</th>
                    <th>Default Retry Strategy</th>
                    <th>Queued Tasks</th>
                    <th>Running Tasks</th>
                    <th>Control Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {queues.map(q => (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 700 }}>{q.name}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{q.priority}</span>
                      </td>
                      <td>{q.concurrencyLimit} workers</td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {q.retryPolicies[0]?.strategy || 'LINEAR'} ({q.retryPolicies[0]?.maxRetries}x)
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{q.jobCounts.QUEUED}</td>
                      <td style={{ fontWeight: 700, color: 'var(--info)' }}>{q.jobCounts.RUNNING}</td>
                      <td style={{ display: 'flex', gap: 10 }}>
                        <button className={`btn ${q.isPaused ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => toggleQueuePaused(q.id, q.isPaused)}>
                          {q.isPaused ? <Play size={12} /> : <Pause size={12} />}
                          {q.isPaused ? 'Resume' : 'Pause'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ========================================== */}
        {/* VIEW: JOBS EXPLORER */}
        {/* ========================================== */}
        {activeTab === 'jobs' && (
          <div style={{ display: 'flex', gap: 24 }}>
            {/* Explorer sidebar filters & table */}
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', backgroundColor: 'white', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                  <input type="text" placeholder="Search by Job ID, error logs..." className="form-control" style={{ paddingLeft: 36 }} value={jobSearch} onChange={e => { setJobSearch(e.target.value); setJobPage(1); }} />
                </div>

                <select className="form-control" style={{ width: 140 }} value={jobStatusFilter} onChange={e => { setJobStatusFilter(e.target.value); setJobPage(1); }}>
                  <option value="ALL">All Statuses</option>
                  <option value="QUEUED">Queued</option>
                  <option value="CLAIMED">Claimed</option>
                  <option value="RUNNING">Running</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                </select>

                <select className="form-control" style={{ width: 160 }} value={jobQueueFilter} onChange={e => { setJobQueueFilter(e.target.value); setJobPage(1); }}>
                  <option value="ALL">All Queues</option>
                  {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>

              <div className="table-container">
                <table className="table-dashboard">
                  <thead>
                    <tr>
                      <th>Job ID</th>
                      <th>Queue</th>
                      <th>Status</th>
                      <th>Retries</th>
                      <th>Run Scheduled At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(job => (
                      <tr key={job.id} onClick={() => viewJobDetails(job)} style={{ cursor: 'pointer', backgroundColor: selectedJob?.id === job.id ? 'var(--primary-light)' : 'transparent' }}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{job.id.substring(0, 8)}...</td>
                        <td>{job.queue.name}</td>
                        <td>
                          <span className={`badge badge-${job.status.toLowerCase()}`}>{job.status}</span>
                        </td>
                        <td>{job.retryCount} / {job.maxRetries}</td>
                        <td>{new Date(job.runAt).toLocaleTimeString()}</td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); viewJobDetails(job); }}>Inspect</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total: <strong>{jobTotal}</strong> jobs found</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px' }} disabled={jobPage === 1} onClick={() => setJobPage(jobPage - 1)}>
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px' }} disabled={jobPage * 8 >= jobTotal} onClick={() => setJobPage(jobPage + 1)}>
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Inspect Detail Panel */}
            <div style={{ flex: 1.2, minWidth: 320 }}>
              {selectedJob ? (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
                    <div>
                      <span className="workspace-label">Job Inspector ID</span>
                      <h4 style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>{selectedJob.id}</h4>
                      <span className="badge badge-queued" style={{ marginTop: 8 }}>Queue: {selectedJob.queue.name}</span>
                    </div>
                    <span className={`badge badge-${selectedJob.status.toLowerCase()}`}>{selectedJob.status}</span>
                  </div>

                  {selectedJob.cronExpression && (
                    <div style={{ backgroundColor: 'var(--warning-light)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--warning-border)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Clock size={16} style={{ color: 'var(--warning)' }} />
                      <span>Recurring Job (Cron: <code>{selectedJob.cronExpression}</code>)</span>
                    </div>
                  )}

                  {/* AI Generated Debug Summary */}
                  {aiSummary && (
                    <div className="ai-summary-box">
                      <div className="ai-summary-header">
                        <Sparkles size={16} />
                        <span>AI Failure Diagnostics</span>
                      </div>
                      <p className="ai-summary-text">{aiSummary.summary}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Suggested Fixes:</span>
                      <ul className="ai-suggestions-list">
                        {aiSummary.suggestedFixes.map((fix: string, fIdx: number) => (
                          <li key={fIdx}>
                            <span className="ai-bullet">✓</span>
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(selectedJob.status === 'FAILED' || selectedJob.status === 'COMPLETED') && (
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleRetryJob(selectedJob.id)}>
                        <RefreshCw size={14} /> Re-queue Task
                      </button>
                    )}
                    {(selectedJob.status === 'QUEUED' || selectedJob.status === 'RUNNING' || selectedJob.status === 'SCHEDULED') && (
                      <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleCancelJob(selectedJob.id)}>
                        Cancel Run
                      </button>
                    )}
                  </div>

                  <div>
                    <span className="workspace-label">Job Execution Payload</span>
                    <pre style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', padding: 12, borderRadius: 6, fontSize: 12, overflowX: 'auto', fontFamily: 'monospace' }}>
                      {JSON.stringify(JSON.parse(selectedJob.payload), null, 2)}
                    </pre>
                  </div>

                  {selectedJob.result && (
                    <div>
                      <span className="workspace-label">Job Output Result</span>
                      <pre style={{ backgroundColor: 'var(--success-light)', border: '1px solid var(--success-border)', padding: 12, borderRadius: 6, fontSize: 12, overflowX: 'auto', fontFamily: 'monospace', color: 'var(--success)' }}>
                        {JSON.stringify(JSON.parse(selectedJob.result), null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Log console */}
                  <div>
                    <span className="workspace-label">Standard Console Out (Logs)</span>
                    <div className="logs-console">
                      {selectedJob.logs && selectedJob.logs.length > 0 ? (
                        selectedJob.logs.map((log: any, idx: number) => (
                          <div key={idx} className="log-line">
                            <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className={`log-level-${log.level.toLowerCase()}`}>[{log.level}]</span>{' '}
                            {log.message}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>No logs registered for this job run.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                  <Info size={32} style={{ marginBottom: 12, color: 'var(--text-muted)' }} />
                  <p style={{ fontSize: 14, textAlign: 'center' }}>Select a job from the table to inspect details, logs, executions, and AI failure diagnostics.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW: WORKERS */}
        {/* ========================================== */}
        {activeTab === 'workers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="card-grid">
              {workers.map(w => (
                <div key={w.id} className="card">
                  <div className="card-header-flex">
                    <span className="card-title" style={{ fontSize: 11 }}>Active Daemon</span>
                    <span className={`badge ${w.status === 'ACTIVE' ? 'badge-completed' : 'badge-failed'}`}>
                      {w.status === 'ACTIVE' ? 'Active' : 'Offline'}
                    </span>
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{w.name}</h4>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>ID: {w.id}</span>

                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 16, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Concurrency Capacity</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{w.concurrency} threads</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>System CPU load</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{w.heartbeats[0]?.cpuUsage?.toFixed(1) || '0.0'}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Memory footprint</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{w.heartbeats[0]?.memoryUsage?.toFixed(1) || '0.0'}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Last heartbeat</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{new Date(w.lastHeartbeat).toLocaleTimeString()}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW: DLQ */}
        {/* ========================================== */}
        {activeTab === 'dlq' && (
          <div className="table-container">
            <table className="table-dashboard">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Queue Source</th>
                  <th>Permanent Failure Reason</th>
                  <th>Failed At</th>
                  <th>Payload Snapshot</th>
                  <th>Operations</th>
                </tr>
              </thead>
              <tbody>
                {dlqEntries.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{entry.jobId.substring(0, 8)}...</td>
                    <td>{entry.queue.name}</td>
                    <td style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 12 }}>{entry.reason}</td>
                    <td>{new Date(entry.failedAt).toLocaleTimeString()}</td>
                    <td>
                      <code style={{ fontSize: 11, backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 4, display: 'block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.payload}
                      </code>
                    </td>
                    <td style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleRetryJob(entry.jobId)}>
                        <RefreshCw size={12} /> Retry Run
                      </button>
                    </td>
                  </tr>
                ))}
                {dlqEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      No failures isolated in the Dead Letter Queue. Everything is operating normally.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* MODAL: CREATE QUEUE */}
      {/* ========================================== */}
      {showCreateQueueModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 20 }}>Configure New Worker Queue</h3>
            <form onSubmit={handleCreateQueue}>
              <div className="form-group">
                <label>Queue Name Identifier</label>
                <input className="form-control" type="text" placeholder="email-queue" value={newQueueName} onChange={e => setNewQueueName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Priority Rank (higher runs first)</label>
                <input className="form-control" type="number" min="1" max="10" value={newQueuePriority} onChange={e => setNewQueuePriority(parseInt(e.target.value))} required />
              </div>
              <div className="form-group">
                <label>Max Concurrency Threads Limit</label>
                <input className="form-control" type="number" min="1" max="50" value={newQueueConcurrency} onChange={e => setNewQueueConcurrency(parseInt(e.target.value))} required />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateQueueModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Queue</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: CREATE JOB */}
      {/* ========================================== */}
      {showCreateJobModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 600 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 20 }}>Submit Background Job</h3>
            <form onSubmit={handleCreateJob}>
              <div className="form-group">
                <label>Target Job Queue</label>
                <select className="form-control" value={jobQueueName} onChange={e => setJobQueueName(e.target.value)}>
                  {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Max Retry Attempts</label>
                <input className="form-control" type="number" min="0" max="10" value={jobMaxRetries} onChange={e => setJobMaxRetries(parseInt(e.target.value))} />
              </div>

              <div className="form-group">
                <label>Job Execution Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className={`btn ${jobType === 'immediate' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: 8 }} onClick={() => setJobType('immediate')}>Immediate</button>
                  <button type="button" className={`btn ${jobType === 'delayed' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: 8 }} onClick={() => setJobType('delayed')}>Delayed</button>
                  <button type="button" className={`btn ${jobType === 'scheduled' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: 8 }} onClick={() => setJobType('scheduled')}>Scheduled</button>
                  <button type="button" className={`btn ${jobType === 'cron' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: 8 }} onClick={() => setJobType('cron')}>Recurring (Cron)</button>
                </div>
              </div>

              {jobType === 'delayed' && (
                <div className="form-group">
                  <label>Delay Duration (milliseconds)</label>
                  <input className="form-control" type="number" placeholder="5000" value={jobDelayMs} onChange={e => setJobDelayMs(e.target.value)} required />
                </div>
              )}

              {jobType === 'scheduled' && (
                <div className="form-group">
                  <label>Scheduled Start Date & Time</label>
                  <input className="form-control" type="datetime-local" value={jobRunAt} onChange={e => setJobRunAt(e.target.value)} required />
                </div>
              )}

              {jobType === 'cron' && (
                <div className="form-group">
                  <label>Cron Schedule Expression</label>
                  <input className="form-control" type="text" placeholder="*/5 * * * *" value={jobCron} onChange={e => setJobCron(e.target.value)} required />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>Example: <code>*/5 * * * *</code> (Runs every 5 minutes)</span>
                </div>
              )}

              <div className="form-group">
                <label>Execution JSON Payload Data</label>
                <textarea className="form-control" style={{ fontFamily: 'monospace', fontSize: 12, height: 120, resize: 'vertical' }} value={jobPayload} onChange={e => setJobPayload(e.target.value)} required />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateJobModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Queue Job</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
