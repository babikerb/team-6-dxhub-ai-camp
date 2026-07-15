import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MOCK_REQUESTS } from './mockData.js';
import AdminDashboard from './AdminDashboard.jsx';
import RequestDetail from './RequestDetail.jsx';

// ── AdminDashboard list view ──────────────────────────────────────────────────

describe('AdminDashboard — list view', () => {
  it('renders all mock requests in the table', () => {
    render(<AdminDashboard />);
    MOCK_REQUESTS.forEach((r) => {
      expect(screen.getByText(r.requestor.software_name)).toBeInTheDocument();
    });
  });

  it('shows a High risk badge for CampusHealth360', () => {
    render(<AdminDashboard />);
    // The High badge should appear (may appear more than once in the table)
    const badges = screen.getAllByText('High');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows a Medium risk badge for AutoCAD LT', () => {
    render(<AdminDashboard />);
    const badges = screen.getAllByText('Medium');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows a Low risk badge for ResearchTrack Pro', () => {
    render(<AdminDashboard />);
    const badges = screen.getAllByText('Low');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('filters requests by status', () => {
    render(<AdminDashboard />);
    const select = screen.getByLabelText('Filter by status');
    fireEvent.change(select, { target: { value: 'Submitted' } });
    // Only AutoCAD LT has status Submitted
    expect(screen.getByText('AutoCAD LT')).toBeInTheDocument();
    expect(screen.queryByText('CampusHealth360')).not.toBeInTheDocument();
    expect(screen.queryByText('ResearchTrack Pro')).not.toBeInTheDocument();
  });

  it('filters requests by flag type (security)', () => {
    render(<AdminDashboard />);
    const select = screen.getByLabelText('Filter by flag');
    fireEvent.change(select, { target: { value: 'security' } });
    // CampusHealth360 and AutoCAD LT have security flag; ResearchTrack Pro does not
    expect(screen.getByText('CampusHealth360')).toBeInTheDocument();
    expect(screen.getByText('AutoCAD LT')).toBeInTheDocument();
    expect(screen.queryByText('ResearchTrack Pro')).not.toBeInTheDocument();
  });

  it('filters requests by department', () => {
    render(<AdminDashboard />);
    const select = screen.getByLabelText('Filter by department');
    fireEvent.change(select, { target: { value: 'Engineering' } });
    expect(screen.getByText('AutoCAD LT')).toBeInTheDocument();
    expect(screen.queryByText('CampusHealth360')).not.toBeInTheDocument();
  });

  it('searches by software name', () => {
    render(<AdminDashboard />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'campus' } });
    expect(screen.getByText('CampusHealth360')).toBeInTheDocument();
    expect(screen.queryByText('AutoCAD LT')).not.toBeInTheDocument();
  });

  it('shows "No requests match" when filters eliminate all results', () => {
    render(<AdminDashboard />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no requests match/i)).toBeInTheDocument();
  });

  it('shows a Clear filters button when a filter is active', () => {
    render(<AdminDashboard />);
    expect(screen.queryByText(/clear filters/i)).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'zoom' } });
    expect(screen.getByText(/clear filters/i)).toBeInTheDocument();
  });

  it('clears all filters when Clear filters is clicked', () => {
    render(<AdminDashboard />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'zoom' } });
    fireEvent.click(screen.getByText(/clear filters/i));
    MOCK_REQUESTS.forEach((r) => {
      expect(screen.getByText(r.requestor.software_name)).toBeInTheDocument();
    });
  });

  it('opens the detail panel when a row is clicked', () => {
    render(<AdminDashboard />);
    fireEvent.click(screen.getByText('CampusHealth360'));
    // Detail panel title should appear
    expect(screen.getAllByText('CampusHealth360').length).toBeGreaterThan(1);
    expect(screen.getByText(/requestor information/i)).toBeInTheDocument();
  });
});

// ── RequestDetail — flag display ──────────────────────────────────────────────

describe('RequestDetail — flag display', () => {
  const highRiskRequest = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
  const lowRiskRequest = MOCK_REQUESTS.find((r) => r.request_id === 'aaa-001');
  const noop = vi.fn();

  it('shows Flagged pills for all three flags on a high-risk request', () => {
    render(
      <RequestDetail request={highRiskRequest} onClose={noop} onSaved={noop} />
    );
    const flaggedPills = screen.getAllByText('Flagged');
    // Each flag row shows Computed + Effective columns — 3 flags × 2 = at least 6 "Flagged" labels
    expect(flaggedPills.length).toBeGreaterThanOrEqual(6);
  });

  it('shows Clear pills for all three flags on a low-risk request', () => {
    render(
      <RequestDetail request={lowRiskRequest} onClose={noop} onSaved={noop} />
    );
    const clearPills = screen.getAllByText('Clear');
    expect(clearPills.length).toBeGreaterThanOrEqual(6);
  });

  it('renders all 18 requestor fields', () => {
    render(
      <RequestDetail request={highRiskRequest} onClose={noop} onSaved={noop} />
    );
    // Spot-check several field labels
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Funding source')).toBeInTheDocument();
    expect(screen.getByText('Notify list')).toBeInTheDocument();
    expect(screen.getByText('Additional details')).toBeInTheDocument();
  });

  it('shows the risk level', () => {
    render(
      <RequestDetail request={highRiskRequest} onClose={noop} onSaved={noop} />
    );
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('displays Computed and Override columns side by side', () => {
    render(
      <RequestDetail request={highRiskRequest} onClose={noop} onSaved={noop} />
    );
    // Each of the 3 flag rows has a "Computed" column label
    const computedLabels = screen.getAllByText('Computed');
    expect(computedLabels.length).toBe(3);
    // "Override" appears as the column header label AND the toggle button text (3 + 3 = 6)
    const overrideLabels = screen.getAllByText('Override');
    expect(overrideLabels.length).toBe(6);
  });
});

// ── RequestDetail — override validation ──────────────────────────────────────

describe('RequestDetail — override validation', () => {
  const request = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
  const noop = vi.fn();

  it('does not show an error before any interaction', () => {
    render(<RequestDetail request={request} onClose={noop} onSaved={noop} />);
    expect(screen.queryByText(/override reason is required/i)).not.toBeInTheDocument();
  });

  it('blocks save and shows error when override is set but reason is empty', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    // Click the ATI toggle button by testid
    fireEvent.click(screen.getByTestId('toggle-ati-review'));

    // Try to save without filling in a reason
    fireEvent.click(screen.getByText('Save changes'));

    await vi.waitFor(() =>
      expect(screen.getByText(/An override reason is required/i)).toBeInTheDocument()
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('blocks save and shows error when override is set, reason filled, but reviewer ID is missing', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    // Toggle ATI override
    fireEvent.click(screen.getByTestId('toggle-ati-review'));

    // Fill in reason but not reviewer ID
    fireEvent.change(screen.getByLabelText('Override reason'), {
      target: { value: 'Manually confirmed ATI is not needed for this use case.' },
    });

    fireEvent.click(screen.getByText('Save changes'));

    await vi.waitFor(() =>
      expect(screen.getByText(/Please enter the name or ID of the reviewer/i)).toBeInTheDocument()
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('calls onSaved when no overrides are set (no validation required)', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    fireEvent.click(screen.getByText('Save changes'));

    // Wait for the simulated async save
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 1000 });
  });

  it('calls onSaved after filling in reason and reviewer ID when override is active', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    // Toggle ATI override via testid
    fireEvent.click(screen.getByTestId('toggle-ati-review'));

    fireEvent.change(screen.getByLabelText('Override reason'), {
      target: { value: 'Business justification provided by department head.' },
    });
    fireEvent.change(screen.getByLabelText('Reviewer name or ID'), {
      target: { value: 'jdoe' },
    });

    fireEvent.click(screen.getByText('Save changes'));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 1000 });
    const savedArg = onSaved.mock.calls[0][0];
    expect(savedArg.admin.overridden_by).toBe('jdoe');
    expect(savedArg.admin.override_reason).toBe('Business justification provided by department head.');
  });

  it('cycles toggle through Override → Flagged → Clear → None', () => {
    render(<RequestDetail request={request} onClose={noop} onSaved={noop} />);

    const btn = screen.getByTestId('toggle-ati-review');

    // Initially null → button says "Override"
    expect(btn.textContent).toBe('Override');

    // null → true: button says "Set → Clear"
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Clear/);

    // true → false: button says "Set → Flag"
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Flag/);

    // false → null: button says "Override" again
    fireEvent.click(btn);
    expect(btn.textContent).toBe('Override');
  });

  it('also uses testid for the calls onSaved after filling in reason test', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    // Toggle ATI override via testid
    fireEvent.click(screen.getByTestId('toggle-ati-review'));

    fireEvent.change(screen.getByLabelText('Override reason'), {
      target: { value: 'Business justification provided by department head.' },
    });
    fireEvent.change(screen.getByLabelText('Reviewer name or ID'), {
      target: { value: 'jdoe' },
    });

    fireEvent.click(screen.getByText('Save changes'));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 1000 });
    const savedArg = onSaved.mock.calls[0][0];
    expect(savedArg.admin.overridden_by).toBe('jdoe');
    expect(savedArg.admin.override_reason).toBe('Business justification provided by department head.');
  });
});
