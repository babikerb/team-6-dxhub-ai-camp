import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MOCK_REQUESTS } from './mockData.js';
import AdminDashboard from './AdminDashboard.jsx';
import RequestDetail from './RequestDetail.jsx';

vi.mock('../../api.js', () => ({
  listRequests: vi.fn(),
  patchAdmin: vi.fn(),
}));

import { listRequests, patchAdmin } from '../../api.js';

beforeEach(() => {
  vi.clearAllMocks();
  listRequests.mockResolvedValue({ items: MOCK_REQUESTS, count: MOCK_REQUESTS.length });
  patchAdmin.mockImplementation(async (_id, payload) => {
    const base = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
    return {
      ...base,
      admin: {
        overrides: payload.overrides,
        override_reason: payload.override_reason,
        overridden_by: payload.overridden_by,
        admin_notes: payload.admin_notes,
      },
      updated_at: new Date().toISOString(),
    };
  });
});

async function renderDashboard() {
  render(<AdminDashboard />);
  await waitFor(() => {
    expect(screen.getByText('CampusHealth360')).toBeInTheDocument();
  });
}

// ── AdminDashboard list view ──────────────────────────────────────────────────

describe('AdminDashboard — list view', () => {
  it('renders all mock requests in the table', async () => {
    await renderDashboard();
    MOCK_REQUESTS.forEach((r) => {
      expect(screen.getByText(r.requestor.software_name)).toBeInTheDocument();
    });
  });

  it('shows a High risk badge for CampusHealth360', async () => {
    await renderDashboard();
    const badges = screen.getAllByText('High');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows a Medium risk badge for AutoCAD LT', async () => {
    await renderDashboard();
    const badges = screen.getAllByText('Medium');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows a Low risk badge for ResearchTrack Pro', async () => {
    await renderDashboard();
    const badges = screen.getAllByText('Low');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('filters requests by status', async () => {
    await renderDashboard();
    const select = screen.getByLabelText('Filter by status');
    fireEvent.change(select, { target: { value: 'Submitted' } });
    expect(screen.getByText('AutoCAD LT')).toBeInTheDocument();
    expect(screen.queryByText('CampusHealth360')).not.toBeInTheDocument();
    expect(screen.queryByText('ResearchTrack Pro')).not.toBeInTheDocument();
  });

  it('filters requests by flag type (security)', async () => {
    await renderDashboard();
    const select = screen.getByLabelText('Filter by flag');
    fireEvent.change(select, { target: { value: 'security' } });
    expect(screen.getByText('CampusHealth360')).toBeInTheDocument();
    expect(screen.getByText('AutoCAD LT')).toBeInTheDocument();
    expect(screen.queryByText('ResearchTrack Pro')).not.toBeInTheDocument();
  });

  it('filters requests by department', async () => {
    await renderDashboard();
    const select = screen.getByLabelText('Filter by department');
    fireEvent.change(select, { target: { value: 'Engineering' } });
    expect(screen.getByText('AutoCAD LT')).toBeInTheDocument();
    expect(screen.queryByText('CampusHealth360')).not.toBeInTheDocument();
  });

  it('searches by software name', async () => {
    await renderDashboard();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'campus' } });
    expect(screen.getByText('CampusHealth360')).toBeInTheDocument();
    expect(screen.queryByText('AutoCAD LT')).not.toBeInTheDocument();
  });

  it('shows "No requests match" when filters eliminate all results', async () => {
    await renderDashboard();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no requests match/i)).toBeInTheDocument();
  });

  it('shows a Clear filters button when a filter is active', async () => {
    await renderDashboard();
    expect(screen.queryByText(/clear filters/i)).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'zoom' } });
    expect(screen.getByText(/clear filters/i)).toBeInTheDocument();
  });

  it('clears all filters when Clear filters is clicked', async () => {
    await renderDashboard();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'zoom' } });
    fireEvent.click(screen.getByText(/clear filters/i));
    MOCK_REQUESTS.forEach((r) => {
      expect(screen.getByText(r.requestor.software_name)).toBeInTheDocument();
    });
  });

  it('opens the detail panel when a row is clicked', async () => {
    await renderDashboard();
    fireEvent.click(screen.getByText('CampusHealth360'));
    expect(screen.getAllByText('CampusHealth360').length).toBeGreaterThan(1);
    expect(screen.getByText(/requestor information/i)).toBeInTheDocument();
  });

  it('labels the security flag pill ITSO (not SEC)', async () => {
    await renderDashboard();
    expect(screen.getAllByText('ITSO').length).toBe(MOCK_REQUESTS.length);
    expect(screen.queryByText('SEC')).not.toBeInTheDocument();
  });

  it('renders an AI/ADS pill for every request', async () => {
    await renderDashboard();
    expect(screen.getAllByText('AI').length).toBe(MOCK_REQUESTS.length);
  });

  it('filters requests by AI/ADS flag', async () => {
    await renderDashboard();
    const select = screen.getByLabelText('Filter by flag');
    fireEvent.change(select, { target: { value: 'ai' } });
    // Only CampusHealth360 has ai_flag: true in the mock data.
    expect(screen.getByText('CampusHealth360')).toBeInTheDocument();
    expect(screen.queryByText('AutoCAD LT')).not.toBeInTheDocument();
    expect(screen.queryByText('ResearchTrack Pro')).not.toBeInTheDocument();
  });

  it('marks a flagged-and-completed review with a "Review completed" pill', async () => {
    await renderDashboard();
    // bbb-002 has security_flag true + review_completions.security_flag true
    expect(screen.getAllByTitle('Review completed').length).toBeGreaterThan(0);
  });

  it('renders the color legend', async () => {
    await renderDashboard();
    expect(screen.getByText('Not flagged')).toBeInTheDocument();
    expect(screen.getByText('Review remaining')).toBeInTheDocument();
    expect(screen.getByText('Review completed')).toBeInTheDocument();
    expect(screen.getByText('* Staff override')).toBeInTheDocument();
  });

  it('renders unknown legacy statuses without crashing', async () => {
    const legacy = {
      ...MOCK_REQUESTS[0],
      request_id: 'zzz-legacy',
      status: 'FLAGSCOMPUTED',
      requestor: { ...MOCK_REQUESTS[0].requestor, software_name: 'LegacyTool' },
    };
    listRequests.mockResolvedValue({ items: [legacy], count: 1 });
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('LegacyTool')).toBeInTheDocument());
    expect(screen.getByText('FLAGSCOMPUTED')).toBeInTheDocument();
  });
});

// ── AdminDashboard — sorting ─────────────────────────────────────────────────

describe('AdminDashboard — sorting', () => {
  function firstRowText() {
    // Row 0 is the header row.
    return screen.getAllByRole('row')[1].textContent;
  }

  it('sorts newest first by default', async () => {
    await renderDashboard();
    expect(firstRowText()).toContain('AutoCAD LT'); // created 2026-07-14T14:00
  });

  it('sorts oldest first when selected', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'oldest' } });
    expect(firstRowText()).toContain('QuickShare Cloud Drive'); // created 2026-06-15
  });

  it('sorts by risk High → Low when selected', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'risk' } });
    // Both High-risk records first; CampusHealth360 is the newer of the two.
    expect(firstRowText()).toContain('CampusHealth360');
  });

  it('sorts by department A–Z when selected', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'department' } });
    expect(firstRowText()).toContain('CampusTour VR'); // Admissions
  });

  it('sorts by software name A–Z when selected', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'software' } });
    expect(firstRowText()).toContain('AutoCAD LT');
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
    const computedLabels = screen.getAllByText('Computed');
    expect(computedLabels.length).toBe(3);
    const overrideLabels = screen.getAllByText('Override');
    expect(overrideLabels.length).toBe(6);
  });
});

// ── RequestDetail — review completion ─────────────────────────────────────────

describe('RequestDetail — review completion', () => {
  const highRiskRequest = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
  const lowRiskRequest = MOCK_REQUESTS.find((r) => r.request_id === 'aaa-001');
  const noop = vi.fn();

  it('shows the saved completion state per review', () => {
    render(<RequestDetail request={highRiskRequest} onClose={noop} onSaved={noop} />);
    expect(screen.getByTestId('complete-itso-review').textContent).toMatch(/Completed/);
    expect(screen.getByTestId('complete-ati-review').textContent).toBe('Remaining');
    expect(screen.getByTestId('complete-integration-review').textContent).toBe('Remaining');
  });

  it('disables the completion toggle when the review does not apply', () => {
    render(<RequestDetail request={lowRiskRequest} onClose={noop} onSaved={noop} />);
    expect(screen.getByTestId('complete-ati-review')).toBeDisabled();
    expect(screen.getByTestId('complete-itso-review')).toBeDisabled();
  });

  it('includes review_completions in the save payload', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={highRiskRequest} onClose={noop} onSaved={onSaved} />);

    fireEvent.click(screen.getByTestId('complete-ati-review'));
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patchAdmin).toHaveBeenCalledWith(
      'bbb-002',
      expect.objectContaining({
        review_completions: {
          ati_flag: true,
          security_flag: true,
          integration_flag: false,
        },
      })
    );
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

    fireEvent.click(screen.getByTestId('toggle-ati-review'));
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(screen.getByText(/An override reason is required/i)).toBeInTheDocument()
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(patchAdmin).not.toHaveBeenCalled();
  });

  it('blocks save and shows error when override is set, reason filled, but reviewer ID is missing', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    fireEvent.click(screen.getByTestId('toggle-ati-review'));
    fireEvent.change(screen.getByLabelText('Override reason'), {
      target: { value: 'Manually confirmed ATI is not needed for this use case.' },
    });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(screen.getByText(/Please enter the name or ID of the reviewer/i)).toBeInTheDocument()
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('calls onSaved when no overrides are set (no validation required)', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patchAdmin).toHaveBeenCalled();
  });

  it('calls onSaved after filling in reason and reviewer ID when override is active', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    fireEvent.click(screen.getByTestId('toggle-ati-review'));
    fireEvent.change(screen.getByLabelText('Override reason'), {
      target: { value: 'Business justification provided by department head.' },
    });
    fireEvent.change(screen.getByLabelText('Reviewer name or ID'), {
      target: { value: 'jdoe' },
    });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const savedArg = onSaved.mock.calls[0][0];
    expect(savedArg.admin.overridden_by).toBe('jdoe');
    expect(savedArg.admin.override_reason).toBe(
      'Business justification provided by department head.'
    );
    expect(patchAdmin).toHaveBeenCalledWith(
      'bbb-002',
      expect.objectContaining({
        overridden_by: 'jdoe',
        override_reason: 'Business justification provided by department head.',
      })
    );
  });

  it('cycles toggle through Override → Flagged → Clear → None', () => {
    render(<RequestDetail request={request} onClose={noop} onSaved={noop} />);

    const btn = screen.getByTestId('toggle-ati-review');
    expect(btn.textContent).toBe('Override');
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Clear/);
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Flag/);
    fireEvent.click(btn);
    expect(btn.textContent).toBe('Override');
  });

  it('also uses testid for the calls onSaved after filling in reason test', async () => {
    const onSaved = vi.fn();
    render(<RequestDetail request={request} onClose={noop} onSaved={onSaved} />);

    fireEvent.click(screen.getByTestId('toggle-ati-review'));
    fireEvent.change(screen.getByLabelText('Override reason'), {
      target: { value: 'Business justification provided by department head.' },
    });
    fireEvent.change(screen.getByLabelText('Reviewer name or ID'), {
      target: { value: 'jdoe' },
    });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const savedArg = onSaved.mock.calls[0][0];
    expect(savedArg.admin.overridden_by).toBe('jdoe');
    expect(savedArg.admin.override_reason).toBe(
      'Business justification provided by department head.'
    );
  });
});
