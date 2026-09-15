import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import MeetingHub from './pages/MeetingHub/MeetingHub';
import './base.css';
declare global { interface Window { userId?: string } }
// Only demo drafts get a demo identity. Production must supply its authenticated user.
if (import.meta.env.MODE === 'demo') window.userId = 'synthetic-preview';
createRoot(document.getElementById('root')!).render(<React.StrictMode>
 {import.meta.env.MODE === 'demo' && <div className="sample-notice">虚构示例 · 操作仅在当前页面保留 · Agent 执行需另行接入</div>}
 <BrowserRouter><MeetingHub /></BrowserRouter>
</React.StrictMode>);
