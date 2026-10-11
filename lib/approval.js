import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

/**
 * Human-in-the-Loop Action Approval Engine (#318).
 * Manages action approval proposals before execution, ensuring
 * no dangerous side effects execute without authorized human confirmation.
 */

export const APPROVAL_STATES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

/**
 * Clean proposal object for storage and API responses.
 */
export function sanitizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  return {
    id: String(proposal.id || randomUUID()),
    taskId: String(proposal.taskId || ''),
    runId: proposal.runId ? String(proposal.runId) : null,
    actionType: String(proposal.actionType || 'execute'),
    summary: String(proposal.summary || ''),
    details: proposal.details && typeof proposal.details === 'object' ? proposal.details : {},
    requestedAt: Number(proposal.requestedAt) || Date.now(),
    expiresAt: Number(proposal.expiresAt) || (Date.now() + 3600000), // Default 1 hour
    state: Object.values(APPROVAL_STATES).includes(proposal.state) ? proposal.state : APPROVAL_STATES.PENDING,
    decidedAt: proposal.decidedAt ? Number(proposal.decidedAt) : null,
    decidedBy: proposal.decidedBy ? String(proposal.decidedBy) : null,
    reason: proposal.reason ? String(proposal.reason) : null,
  };
}

/**
 * In-memory / persistent registry for task proposals.
 */
export class ApprovalManager {
  constructor() {
    this.proposals = new Map();
  }

  /**
   * Create a new pending approval proposal for a task.
   */
  createProposal(taskId, runId, { actionType = 'execute', summary = '', details = {}, timeoutMs = 3600000 } = {}) {
    // If an existing pending proposal exists for this task, invalidate it as superseded
    for (const [id, prop] of this.proposals.entries()) {
      if (prop.taskId === taskId && prop.state === APPROVAL_STATES.PENDING) {
        prop.state = APPROVAL_STATES.CANCELLED;
        prop.decidedAt = Date.now();
        prop.reason = 'Superseded by newer proposal';
      }
    }

    const proposal = sanitizeProposal({
      id: 'appr_' + randomUUID().replace(/-/g, '').slice(0, 12),
      taskId,
      runId,
      actionType,
      summary,
      details,
      requestedAt: Date.now(),
      expiresAt: Date.now() + (Number(timeoutMs) > 0 ? Number(timeoutMs) : 3600000),
      state: APPROVAL_STATES.PENDING,
    });

    this.proposals.set(proposal.id, proposal);
    logger.info(`[dsh-cron] created approval proposal "${proposal.id}" for task "${taskId}": ${summary}`);
    return proposal;
  }

  getProposal(proposalId) {
    const prop = this.proposals.get(proposalId);
    if (!prop) return null;
    // Check expiration on read
    if (prop.state === APPROVAL_STATES.PENDING && Date.now() > prop.expiresAt) {
      prop.state = APPROVAL_STATES.EXPIRED;
      prop.decidedAt = Date.now();
      prop.reason = 'Approval expired';
    }
    return prop;
  }

  getPendingProposalForTask(taskId) {
    for (const prop of this.proposals.values()) {
      if (prop.taskId === taskId && prop.state === APPROVAL_STATES.PENDING) {
        if (Date.now() > prop.expiresAt) {
          prop.state = APPROVAL_STATES.EXPIRED;
          prop.decidedAt = Date.now();
          prop.reason = 'Approval expired';
          continue;
        }
        return prop;
      }
    }
    return null;
  }

  listProposals({ taskId = null, state = null } = {}) {
    const list = [];
    const now = Date.now();
    for (const prop of this.proposals.values()) {
      if (prop.state === APPROVAL_STATES.PENDING && now > prop.expiresAt) {
        prop.state = APPROVAL_STATES.EXPIRED;
        prop.decidedAt = now;
        prop.reason = 'Approval expired';
      }
      if (taskId && prop.taskId !== taskId) continue;
      if (state && prop.state !== state) continue;
      list.push({ ...prop });
    }
    return list.sort((a, b) => b.requestedAt - a.requestedAt);
  }

  /**
   * Decide on a proposal (approve or reject) with replay and double-click protection.
   */
  decide(proposalId, decision, { decidedBy = 'user', reason = '' } = {}) {
    const prop = this.getProposal(proposalId);
    if (!prop) {
      return { ok: false, error: 'Proposal not found' };
    }
    if (prop.state !== APPROVAL_STATES.PENDING) {
      return { ok: false, error: `Proposal already resolved with state: ${prop.state}`, proposal: prop };
    }

    const state = decision === 'approve' ? APPROVAL_STATES.APPROVED : APPROVAL_STATES.REJECTED;
    prop.state = state;
    prop.decidedAt = Date.now();
    prop.decidedBy = decidedBy;
    prop.reason = reason;

    logger.info(`[dsh-cron] proposal "${proposalId}" ${state} by ${decidedBy}${reason ? ': ' + reason : ''}`);
    return { ok: true, proposal: prop };
  }
}

export const approvalManager = new ApprovalManager();
