#!/usr/bin/env node
/**
 * Generate visualization dashboard for causal learner
 * Exports HTML file with Event Pool, Regulation Network, and Learning Curves
 */

import { createStorage } from '../dist/core/storage.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateVisualization(dbPath) {
  console.log('📊 Generating visualization dashboard...\n');

  const storage = createStorage(dbPath);
  const stats = storage.getStats();
  const events = storage.listEvents({ limit: 500 });
  const regulations = storage.listRegulations({ limit: 500 });

  console.log(`📈 Data loaded:`);
  console.log(`   Events: ${stats.eventCount}`);
  console.log(`   Regulations: ${stats.regulationCount}`);
  console.log(`   Observations: ${stats.observationCount}\n`);

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Causal Learner Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #0f0f1e;
      color: #e0e0e0;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #4fc3f7; margin-bottom: 10px; font-size: 32px; }
    .subtitle { color: #888; margin-bottom: 30px; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #2a2a3e;
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #4fc3f7;
      margin: 10px 0;
    }
    .stat-label { color: #888; font-size: 14px; }
    .stat-detail { color: #aaa; font-size: 12px; margin-top: 8px; }

    .section {
      background: #1a1a2e;
      padding: 25px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid #2a2a3e;
    }
    .section-title {
      color: #4fc3f7;
      font-size: 20px;
      margin-bottom: 15px;
      border-bottom: 2px solid #2a2a3e;
      padding-bottom: 10px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #2a2a3e;
    }
    th {
      background: #0f0f1e;
      color: #4fc3f7;
      font-weight: 600;
    }
    tr:hover { background: #242438; }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-open { background: #ff6b6b; color: #fff; }
    .status-closed { background: #51cf66; color: #fff; }
    .status-resolved { background: #51cf66; color: #fff; }
    .status-candidate { background: #ffd43b; color: #000; }
    .status-hypothesis { background: #74c0fc; color: #000; }
    .status-confirmed { background: #51cf66; color: #fff; }
    .status-retired { background: #868e96; color: #fff; }

    .keyword-tag {
      display: inline-block;
      background: #2a2a3e;
      padding: 4px 10px;
      margin: 3px;
      border-radius: 4px;
      font-size: 12px;
      color: #aaa;
    }

    .chart-container {
      margin: 20px 0;
      padding: 20px;
      background: #0f0f1e;
      border-radius: 8px;
    }

    code {
      background: #0f0f1e;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Consolas', monospace;
      color: #4fc3f7;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧠 Causal Learner Dashboard</h1>
    <div class="subtitle">Exception-Driven Causal Learning System</div>

    <!-- Statistics Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Observations</div>
        <div class="stat-value">${stats.observationCount}</div>
        <div class="stat-detail">Raw inputs processed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Events (Unexplained)</div>
        <div class="stat-value">${stats.eventCount}</div>
        <div class="stat-detail">Open: ${stats.eventsByStatus.open} | Resolved: ${stats.eventsByStatus.resolved}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Causal Regulations</div>
        <div class="stat-value">${stats.regulationCount}</div>
        <div class="stat-detail">Confirmed: ${stats.regulationsByStatus.confirmed} | Hypothesis: ${stats.regulationsByStatus.hypothesis}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Learning Rate</div>
        <div class="stat-value">${stats.eventCount > 0 ? ((stats.regulationCount / stats.eventCount) * 100).toFixed(1) : 0}%</div>
        <div class="stat-detail">Regulations per Event</div>
      </div>
    </div>

    <!-- Event Pool Analysis -->
    <div class="section">
      <div class="section-title">📋 Event Pool (Unexplained Anomalies)</div>
      <table>
        <thead>
          <tr>
            <th>Event ID</th>
            <th>Status</th>
            <th>Unexplained Aspects</th>
            <th>Context</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${events.slice(0, 50).map(event => `
            <tr>
              <td><code>${event.eventId}</code></td>
              <td><span class="status-badge status-${event.status}">${event.status}</span></td>
              <td>
                ${event.unexplainedAspects.slice(0, 3).map(f =>
                  `<span class="keyword-tag">${f.pred}=${typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}</span>`
                ).join(' ')}
              </td>
              <td>${event.context?.repo || event.context?.source || '-'}</td>
              <td>${new Date(event.timestamp).toLocaleString('zh-CN')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Regulation Library -->
    <div class="section">
      <div class="section-title">⚡ Causal Regulation Library</div>
      <table>
        <thead>
          <tr>
            <th>Regulation ID</th>
            <th>Status</th>
            <th>Pattern (Pre → Eff)</th>
            <th>Evidence</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${regulations.map(reg => {
            const support = reg.supportN || 0;
            const contradict = reg.counterexampleN || 0;
            const confidence = support + contradict > 0
              ? (support / (support + contradict) * 100).toFixed(0)
              : 0;

            return `
            <tr>
              <td><code>${reg.regulationId}</code></td>
              <td><span class="status-badge status-${reg.status}">${reg.status}</span></td>
              <td>
                <div style="font-size: 12px; line-height: 1.6;">
                  <strong>Pre:</strong> ${reg.pre.slice(0, 2).map(f => f.pred).join(', ')}${reg.pre.length > 2 ? '...' : ''}<br>
                  <strong>Eff:</strong> ${reg.eff.slice(0, 2).map(f => f.pred).join(', ')}${reg.eff.length > 2 ? '...' : ''}
                </div>
              </td>
              <td>
                <div style="font-size: 12px;">
                  ✅ ${support} | ❌ ${contradict}<br>
                  <strong>${confidence}%</strong> confidence
                </div>
              </td>
              <td style="max-width: 300px; font-size: 12px; color: #aaa;">
                ${(reg.description || '').substring(0, 80)}${(reg.description || '').length > 80 ? '...' : ''}
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>

    <!-- Learning Curve -->
    <div class="section">
      <div class="section-title">📈 Learning Progress</div>
      <div class="chart-container">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center;">
          <div>
            <div style="font-size: 14px; color: #888; margin-bottom: 10px;">Regulation Status Distribution</div>
            <div style="font-size: 24px; color: #ffd43b;">⬤ ${stats.regulationsByStatus.candidate}</div>
            <div style="font-size: 12px; color: #888;">Candidate</div>
            <div style="font-size: 24px; color: #74c0fc; margin-top: 10px;">⬤ ${stats.regulationsByStatus.hypothesis}</div>
            <div style="font-size: 12px; color: #888;">Hypothesis</div>
            <div style="font-size: 24px; color: #51cf66; margin-top: 10px;">⬤ ${stats.regulationsByStatus.confirmed}</div>
            <div style="font-size: 12px; color: #888;">Confirmed</div>
          </div>

          <div>
            <div style="font-size: 14px; color: #888; margin-bottom: 10px;">Event Status Distribution</div>
            <div style="font-size: 24px; color: #ff6b6b;">⬤ ${stats.eventsByStatus.open}</div>
            <div style="font-size: 12px; color: #888;">Open (Need Learning)</div>
            <div style="font-size: 24px; color: #51cf66; margin-top: 10px;">⬤ ${stats.eventsByStatus.resolved}</div>
            <div style="font-size: 12px; color: #888;">Resolved (Learned)</div>
          </div>

          <div>
            <div style="font-size: 14px; color: #888; margin-bottom: 10px;">System Efficiency</div>
            <div style="font-size: 32px; color: #4fc3f7; margin: 20px 0;">
              ${stats.eventCount > 0 ? ((stats.eventsByStatus.resolved / stats.eventCount) * 100).toFixed(1) : 0}%
            </div>
            <div style="font-size: 12px; color: #888;">Events Resolved Rate</div>
          </div>
        </div>
      </div>
    </div>

    <!-- System Info -->
    <div class="section">
      <div class="section-title">ℹ️ System Information</div>
      <div style="font-size: 14px; line-height: 2; color: #aaa;">
        <strong style="color: #4fc3f7;">Database:</strong> ${dbPath}<br>
        <strong style="color: #4fc3f7;">Generated:</strong> ${new Date().toLocaleString('zh-CN')}<br>
        <strong style="color: #4fc3f7;">Philosophy:</strong> Exception-driven learning - Only record what can't be explained<br>
        <strong style="color: #4fc3f7;">Predicate Evolution:</strong> Keyword-based → Statistical abstraction → Structured predicates
      </div>
    </div>
  </div>

  <script>
    // Future: Add interactive charts with D3.js or Chart.js
    console.log('Causal Learner Dashboard loaded');
    console.log('Stats:', ${JSON.stringify(stats)});
  </script>
</body>
</html>`;

  // Save HTML file
  const outputDir = path.join(__dirname, '../../visualization');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'dashboard.html');
  fs.writeFileSync(outputFile, html);

  console.log(`✅ Dashboard generated: ${outputFile}`);
  console.log(`\nOpen in browser:`);
  console.log(`   file:///${outputFile.replace(/\\/g, '/')}\n`);

  storage.close();
  return outputFile;
}

// Main
const args = process.argv.slice(2);
const dbPath = args[0] || path.join(__dirname, '../../data/causal.db');

if (!fs.existsSync(dbPath) && dbPath !== ':memory:') {
  console.log('⚠️ Database not found, using empty data for demo');
}

generateVisualization(dbPath).catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
