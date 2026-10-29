import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getTenants: vi.fn(),
  getOperators: vi.fn(),
  getAuditLogs: vi.fn(),
  createTenant: vi.fn(),
  updateTenantStatus: vi.fn(),
  retryTenantProvisioning: vi.fn(),
  updatePlatformProfile: vi.fn(),
  changePlatformPassword: vi.fn(),
  lookupInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  requestPasswordReset: vi.fn(),
  verifyPasswordResetOtp: vi.fn(),
  resetPassword: vi.fn(),
  inviteOperator: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  updateOperatorRole: vi.fn(),
  updateOperatorStatus: vi.fn(),
  authErrorMessage: vi.fn((cause: unknown) => (cause instanceof Error ? cause.message : 'connection failed')),
  registerPlatformUser: vi.fn(),
}));

vi.mock('@/lib/platform-api', () => ({
  authClient: {
    getSession: mocks.getSession,
    signIn: { email: mocks.signIn },
    signOut: mocks.signOut,
  },
  getTenants: mocks.getTenants,
  getOperators: mocks.getOperators,
  getAuditLogs: mocks.getAuditLogs,
  createTenant: mocks.createTenant,
  updateTenantStatus: mocks.updateTenantStatus,
  retryTenantProvisioning: mocks.retryTenantProvisioning,
  updatePlatformProfile: mocks.updatePlatformProfile,
  changePlatformPassword: mocks.changePlatformPassword,
  lookupInvitation: mocks.lookupInvitation,
  acceptInvitation: mocks.acceptInvitation,
  requestPasswordReset: mocks.requestPasswordReset,
  verifyPasswordResetOtp: mocks.verifyPasswordResetOtp,
  resetPassword: mocks.resetPassword,
  inviteOperator: mocks.inviteOperator,
  resendInvitation: mocks.resendInvitation,
  revokeInvitation: mocks.revokeInvitation,
  updateOperatorRole: mocks.updateOperatorRole,
  updateOperatorStatus: mocks.updateOperatorStatus,
  authErrorMessage: mocks.authErrorMessage,
  registerPlatformUser: mocks.registerPlatformUser,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

const operator = { id: 'op-1', name: 'Platform Admin', email: 'admin@example.com', role: 'platform_admin', emailVerified: true, disabled: false, createdAt: '2026-10-19T10:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z' };
const tenant = { id: 'tenant-1', name: 'Northfield Academy', slug: 'northfield', status: 'active', schoolTenantId: 'school-1', adminName: 'Ada Admin', adminEmail: 'ada@northfield.edu', provisioningError: null, createdAt: '2026-10-19T10:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z' };
const otherOperator = { id: 'op-2', name: 'Taylor Viewer', email: 'viewer@example.com', role: 'platform_read_only', emailVerified: true, disabled: false, createdAt: '2026-10-19T10:30:00.000Z', updatedAt: '2026-10-19T10:30:00.000Z' };
const pendingInvite = { id: '00000000-0000-4000-8000-000000000003', email: 'sam@example.com', name: 'Sam Invitee', role: 'platform_read_only', status: 'pending', expiresAt: '2026-10-21T10:00:00.000Z', createdAt: '2026-10-19T10:00:00.000Z' };

function configureAuthenticated(role = 'platform_admin') {
  mocks.getSession.mockResolvedValue({ data: { user: { id: 'op-1', name: 'Platform Admin', email: 'admin@example.com', role } } });
  mocks.getTenants.mockResolvedValue([tenant]);
  mocks.getOperators.mockResolvedValue({ operators: [operator], invitations: [] });
  mocks.getAuditLogs.mockResolvedValue({ logs: [] });
}

describe('Platform app authentication and permissions', () => {
  it('redirects a session without an authenticated user to sign in', async () => {
    mocks.getSession.mockResolvedValue({ data: null });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });

  it('loads platform overview data for an authenticated admin', async () => {
    configureAuthenticated();
    renderAt('/');
    expect(await screen.findByText('Northfield Academy')).toBeTruthy();
    expect(await screen.findByText('Platform admin')).toBeTruthy();
    expect(mocks.getTenants).toHaveBeenCalledOnce();
    expect(mocks.getOperators).toHaveBeenCalledOnce();
  });

  it('hides admin-only controls for a read-only operator', async () => {
    configureAuthenticated('platform_read_only');
    renderAt('/');
    expect(await screen.findByText('Read-only access')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /school workspaces/i }));
    expect(await screen.findByText('All school workspaces')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /create workspace/i })).toBeNull();
  });

  it('documents every platform function on the documentation page', async () => {
    configureAuthenticated();
    renderAt('/');
    expect(await screen.findByText('Northfield Academy')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /documentation/i }));
    expect(await screen.findByRole('heading', { name: 'Platform documentation' })).toBeTruthy();
    expect(screen.getByText('Sign-in and session')).toBeTruthy();
    expect(screen.getByText('Password recovery')).toBeTruthy();
    expect(screen.getByText('Operator invitations')).toBeTruthy();
    expect(screen.getByText('Roles and safeguards')).toBeTruthy();
    expect(screen.getByText('School workspace provisioning')).toBeTruthy();
    expect(screen.getByText('School admin activation')).toBeTruthy();
    expect(screen.getByText('Overview and lists')).toBeTruthy();
    expect(screen.getByText('Appearance controls')).toBeTruthy();
    expect(screen.getByText('Development bootstrap')).toBeTruthy();
    expect(screen.getByText('Security rules')).toBeTruthy();
    expect(screen.getByText(/covers the Platform control plane only/i)).toBeTruthy();
  });
});

describe('Public account flows', () => {
  it('signs in and routes the operator to the platform', async () => {
    mocks.signIn.mockResolvedValue({ data: { token: 'session' }, error: null });
    configureAuthenticated();
    renderAt('/sign-in');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'a-secure-password' }));
    expect(await screen.findByText('Northfield Academy')).toBeTruthy();
  });

  it('uses a generic password-reset request then verifies and resets the password', async () => {
    mocks.requestPasswordReset.mockResolvedValue({ sent: true });
    mocks.verifyPasswordResetOtp.mockResolvedValue({ valid: true });
    mocks.resetPassword.mockResolvedValue({ reset: true });
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'admin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    expect(await screen.findByText(/we’ll send a one-time code|Enter the six-digit code/i)).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Six-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    const password = await screen.findByLabelText('New password');
    fireEvent.change(password, { target: { value: 'a-long-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a-long-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated', level: 1 })).toBeTruthy();
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({ email: 'admin@example.com' });
    expect(mocks.verifyPasswordResetOtp).toHaveBeenCalledWith({ email: 'admin@example.com', otp: '123456' });
    expect(mocks.resetPassword).toHaveBeenCalledWith({ email: 'admin@example.com', otp: '123456', password: 'a-long-password-123' });
  });

  it('refuses a mistyped password confirmation without spending the reset code', async () => {
    mocks.requestPasswordReset.mockResolvedValue({ sent: true });
    mocks.verifyPasswordResetOtp.mockResolvedValue({ valid: true });
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'admin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    fireEvent.change(await screen.findByLabelText('Six-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'a-long-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a-long-password-124' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    // The code allows five failed attempts, so a typo must never reach the endpoint.
    expect(await screen.findByText('The two passwords do not match.')).toBeTruthy();
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it('accepts a valid operator invitation and displays the account email', async () => {
    mocks.lookupInvitation.mockResolvedValue({ valid: true, email: 'invitee@example.com', name: 'Alex Operator' });
    mocks.acceptInvitation.mockResolvedValue({ accepted: true });
    renderAt(`/invite/${'a'.repeat(43)}`);
    expect(await screen.findByText('invitee@example.com')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Create password'), { target: { value: 'valid-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'valid-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('Invitation accepted')).toBeTruthy();
    expect(mocks.acceptInvitation).toHaveBeenCalledWith({ token: 'a'.repeat(43), password: 'valid-password-123' });
  });

  it('refuses a mistyped password confirmation without burning the single-use invitation', async () => {
    mocks.lookupInvitation.mockResolvedValue({ valid: true, email: 'invitee@example.com', name: 'Alex Operator' });
    renderAt(`/invite/${'a'.repeat(43)}`);
    expect(await screen.findByText('invitee@example.com')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Create password'), { target: { value: 'valid-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'valid-password-124' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('The two passwords do not match.')).toBeTruthy();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });
});

describe('Platform admin lifecycle', () => {
  function roster(operators: unknown[], invitations: unknown[] = []) {
    mocks.getOperators.mockResolvedValue({ operators, invitations });
  }

  function rowFor(name: string): HTMLElement {
    const node = screen.getByText(name);
    const row = node.closest('div.flex.flex-wrap');
    if (!row) throw new Error(`No operator row found for ${name}`);
    return row as HTMLElement;
  }

  it('provisions a school workspace through the create dialog', async () => {
    configureAuthenticated();
    mocks.createTenant.mockResolvedValue({ ...tenant, id: 'tenant-2', name: 'Riverside Prep', slug: 'riverside-prep', schoolTenantId: null, provisioningError: null });
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Northfield Academy')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /school workspaces/i }));
    await user.click(await screen.findByRole('button', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Activation happens separately')).toBeTruthy();

    await user.type(within(dialog).getByLabelText('School name'), 'Riverside Prep');
    await user.type(within(dialog).getByLabelText('Workspace address'), 'riverside-prep');
    await user.type(within(dialog).getByLabelText('Admin contact name'), 'Sam Admin');
    await user.type(within(dialog).getByLabelText('Admin contact email'), 'sam@riverside.edu');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(mocks.createTenant).toHaveBeenCalledWith({
      name: 'Riverside Prep',
      slug: 'riverside-prep',
      adminName: 'Sam Admin',
      adminEmail: 'sam@riverside.edu',
    }));
    expect(await screen.findByText('Riverside Prep is provisioned')).toBeTruthy();
    expect(screen.getAllByText('Riverside Prep').length).toBeGreaterThan(0);
  });

  it('invites an operator with the selected platform role', async () => {
    configureAuthenticated();
    mocks.inviteOperator.mockResolvedValue({ invitation: { ...pendingInvite, email: 'taylor@example.com', name: 'Taylor Morgan' }, delivery: 'sent' });
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Platform admin')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^operators$/i }));
    await user.click(await screen.findByRole('button', { name: 'Invite operator' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Full name'), 'Taylor Morgan');
    await user.type(within(dialog).getByLabelText('Work email'), 'taylor@example.com');
    await user.click(within(dialog).getByLabelText('Platform role'));
    await user.click(await screen.findByRole('option', { name: 'Platform admin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(mocks.inviteOperator).toHaveBeenCalledWith({
      name: 'Taylor Morgan',
      email: 'taylor@example.com',
      role: 'platform_admin',
    }));
    expect(await screen.findByText('Invitation sent to taylor@example.com. It expires in 48 hours.')).toBeTruthy();
    expect(await screen.findByText('Operator access updated')).toBeTruthy();
    // initial load + page switch to operators + the post-invite refresh
    expect(mocks.getOperators).toHaveBeenCalledTimes(3);
  });

  it('changes another operator’s role from the row select', async () => {
    configureAuthenticated();
    roster([operator, otherOperator]);
    mocks.updateOperatorRole.mockResolvedValue({ updated: true });
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Platform admin')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^operators$/i }));
    expect(await screen.findByText('Taylor Viewer')).toBeTruthy();
    await user.click(within(rowFor('Taylor Viewer')).getByLabelText('Role for Taylor Viewer'));
    await user.click(await screen.findByRole('option', { name: 'Platform admin' }));

    await waitFor(() => expect(mocks.updateOperatorRole).toHaveBeenCalledWith('op-2', 'platform_admin'));
    expect(await screen.findByText('Taylor Viewer is now a platform admin.')).toBeTruthy();
  });

  it('disables an operator after the confirmation dialog', async () => {
    configureAuthenticated();
    roster([operator, otherOperator]);
    mocks.updateOperatorStatus.mockResolvedValue({ updated: true });
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Platform admin')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^operators$/i }));
    expect(await screen.findByText('Taylor Viewer')).toBeTruthy();
    await user.click(within(rowFor('Taylor Viewer')).getByRole('button', { name: 'Disable' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Disable operator' }));

    await waitFor(() => expect(mocks.updateOperatorStatus).toHaveBeenCalledWith('op-2', true));
    expect(await screen.findByText('Operator access updated')).toBeTruthy();
    expect(await screen.findByText('Taylor Viewer is disabled.')).toBeTruthy();
  });

  it('resends and revokes a pending invitation', async () => {
    configureAuthenticated();
    roster([operator, otherOperator], [pendingInvite]);
    mocks.resendInvitation.mockResolvedValue({ invitation: pendingInvite, delivery: 'sent' });
    mocks.revokeInvitation.mockResolvedValue({ updated: true });
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Platform admin')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^operators$/i }));
    await user.click(await screen.findByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(mocks.resendInvitation).toHaveBeenCalledWith(pendingInvite.id));
    expect(await screen.findByText('A new invitation was issued for sam@example.com; the previous link is no longer valid.')).toBeTruthy();

    const revoke = await screen.findByRole('button', { name: 'Revoke invitation for sam@example.com' });
    await waitFor(() => expect((revoke as HTMLButtonElement).disabled).toBe(false));
    await user.click(revoke);
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Revoke invitation' }));

    await waitFor(() => expect(mocks.revokeInvitation).toHaveBeenCalledWith(pendingInvite.id));
    expect(await screen.findByText('Invitation for sam@example.com was revoked.')).toBeTruthy();
  });
});

describe('Account manager (platform_user) permissions', () => {
  function configureAccountManager() {
    mocks.getSession.mockResolvedValue({ data: { user: { id: 'cm-1', name: 'Casey Manager', email: 'manager@example.com', role: 'platform_user' } } });
    mocks.getTenants.mockResolvedValue([tenant]);
    mocks.getOperators.mockResolvedValue({ operators: [operator], invitations: [] });
  }

  it('registers a new account and returns to sign in', async () => {
    mocks.registerPlatformUser.mockResolvedValue({ registered: true, id: 'cm-1' });
    renderAt('/sign-up');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Casey Manager' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'manager@example.com' } });
    fireEvent.change(screen.getByLabelText('Create password'), { target: { value: 'a-long-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a-long-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mocks.registerPlatformUser).toHaveBeenCalledWith({
      name: 'Casey Manager',
      email: 'manager@example.com',
      password: 'a-long-password-123',
    }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });

  it('refuses a mismatched password confirmation without spending the request', async () => {
    renderAt('/sign-up');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Casey Manager' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'manager@example.com' } });
    fireEvent.change(screen.getByLabelText('Create password'), { target: { value: 'a-long-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a-long-password-124' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('The two passwords do not match.')).toBeTruthy();
    expect(mocks.registerPlatformUser).not.toHaveBeenCalled();
  });

  it('hides the operator roster and the operator count from an account manager', async () => {
    configureAccountManager();
    renderAt('/');
    expect(await screen.findByText('Account manager')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^operators$/i })).toBeNull();
    expect(screen.queryByText('Operators')).toBeNull();
    // The operator roster is never fetched for a customer account.
    expect(mocks.getOperators).not.toHaveBeenCalled();
  });

  it('still lets an account manager create a school workspace', async () => {
    configureAccountManager();
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Northfield Academy')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /my school workspaces/i }));
    expect((await screen.findAllByRole('heading', { name: 'My school workspaces' })).length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: 'Create workspace' })).toBeTruthy();
  });

  it('allows suspending a workspace, retrying failed provisioning, and viewing audit logs and account settings', async () => {
    configureAuthenticated();
    const failedTenant = {
      ...tenant,
      id: 'tenant-failed',
      name: 'Westbrook High',
      slug: 'westbrook',
      status: 'provisioning_failed',
      schoolTenantId: null,
      provisioningError: 'School API timed out during provisioning.',
    };
    mocks.getTenants.mockResolvedValue([tenant, failedTenant]);
    mocks.retryTenantProvisioning.mockResolvedValue({ ...failedTenant, status: 'active', schoolTenantId: 'school-2', provisioningError: null });
    mocks.updateTenantStatus.mockResolvedValue({ ...tenant, status: 'suspended' });
    mocks.getAuditLogs.mockResolvedValue({
      logs: [{
        id: '00000000-0000-4000-8000-000000000099',
        actorUserId: 'op-1',
        actorName: 'Platform Admin',
        actorEmail: 'admin@example.com',
        action: 'tenant.suspended',
        entityType: 'tenant',
        entityId: 'tenant-1',
        details: { slug: 'northfield' },
        createdAt: '2026-10-19T12:00:00.000Z',
      }],
    });
    mocks.updatePlatformProfile.mockResolvedValue({ updated: true, name: 'Updated Admin' });

    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Northfield Academy')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /school workspaces/i }));
    expect(await screen.findByText('Provisioning attention required')).toBeTruthy();
    expect(screen.getAllByText(/School API timed out during provisioning\./).length).toBeGreaterThan(0);

    const retryButtons = screen.getAllByRole('button', { name: /retry provisioning/i });
    await user.click(retryButtons[0]!);
    await waitFor(() => expect(mocks.retryTenantProvisioning).toHaveBeenCalledWith('tenant-failed'));

    const suspendButtons = screen.getAllByRole('button', { name: 'Suspend' });
    await user.click(suspendButtons[0]!);
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(mocks.updateTenantStatus).toHaveBeenCalledWith('tenant-1', 'suspended'));

    await user.click(screen.getByRole('button', { name: /audit logs/i }));
    expect(await screen.findAllByText('tenant.suspended')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /account settings/i }));
    const nameInput = await screen.findByLabelText('Full name');
    fireEvent.change(nameInput, { target: { value: 'Updated Admin' } });
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mocks.updatePlatformProfile).toHaveBeenCalledWith({ name: 'Updated Admin' }));
  });
});
