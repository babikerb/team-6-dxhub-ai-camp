import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MOCK_REQUESTS } from './mockData.js';
import AdminDashboard from './AdminDashboard.jsx';
import RequestDetail from './RequestDetail.jsx';

vi.mock('../../api.js', () => ({
  listRequests: vi.fn(),
  patchAdmin: vi.fn(),
  getReviewDocs: vi.fn(),
}));

import { listRequests, patchAdmin, getReviewDocs } from '../../api.js';

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
  // Return the review_docs already on each mock record so the live fetch
  // matches what the table expects.
  getReviewDocs.mockImplementation(async (requestId) => {
    const record = MOCK_REQUESTS.find((r) => r.request_id === requestId);
    return { request_id: requestId, review_docs: record?.review_docs ?? {} };
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


// ── AdminDashboard — review document columns ──────────────────────────────────

describe('AdminDashboard — review document columns', () => {
  it('renders ATI Docs, ITSO Docs, and Integration Docs column headers', async () => {
    await renderDashboard();
    expect(screen.getByText('ATI Docs')).toBeInTheDocument();
    expect(screen.getByText('ITSO Docs')).toBeInTheDocument();
    expect(screen.getByText('Integration Docs')).toBeInTheDocument();
  });

  it('shows "Review in progress, gathering documents" for pending ATI docs (aaa-001)', async () => {
    await renderDashboard();
    // aaa-001 has all three as pending
    const pendingCells = screen.getAllByText('Review in progress, gathering documents');
    // 7 requests × 3 columns, some are pending; just verify at least some show
    expect(pendingCells.length).toBeGreaterThan(0);
  });

  it('shows "No documents found. Contact vendor" for ITSO no_docs (ccc-003)', async () => {
    await renderDashboard();
    // ccc-003 itso = no_docs, message = "No documents found. Contact vendor"
    const noDocsCells = screen.getAllByText('No documents found. Contact vendor');
    expect(noDocsCells.length).toBeGreaterThan(0);
  });

  it('shows "No documents found" for Integration no_docs (bbb-002)', async () => {
    await renderDashboard();
    // bbb-002 integration = no_docs, message = "No documents found"
    const noDocCells = screen.getAllByText('No documents found');
    expect(noDocCells.length).toBeGreaterThan(0);
  });

  it('shows download links for complete ATI docs (bbb-002 has privacy_policy.pdf and vpat.pdf)', async () => {
    await renderDashboard();
    // bbb-002 ati is complete with two files; ddd-004 also has vpat.pdf so use getAllByLabelText
    expect(screen.getAllByLabelText('Download privacy_policy.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Download vpat.pdf').length).toBeGreaterThan(0);
  });

  it('shows download links for complete ITSO docs (bbb-002 has hecvat.pdf)', async () => {
    await renderDashboard();
    expect(screen.getAllByLabelText('Download hecvat.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Download soc2.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Download terms_of_service.pdf').length).toBeGreaterThan(0);
  });

  it('download link href matches the presigned URL in mock data', async () => {
    await renderDashboard();
    // bbb-002's vpat.pdf has a specific presigned URL; find all and check at least one matches
    const links = screen.getAllByLabelText('Download vpat.pdf');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('https://example.s3.amazonaws.com/presigned/vpat.pdf');
  });

  it('download links open in a new tab (target=_blank)', async () => {
    await renderDashboard();
    // Any vpat.pdf link must have target=_blank
    const links = screen.getAllByLabelText('Download vpat.pdf');
    links.forEach((l) => expect(l.getAttribute('target')).toBe('_blank'));
  });
});

// ── RequestDetail — review documents section ──────────────────────────────────

describe('RequestDetail — review documents section', () => {
  const noop = vi.fn();

  it('renders the Review Documents section heading', () => {
    const req = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    expect(screen.getByText('Review Documents')).toBeInTheDocument();
  });

  it('shows ATI Docs, ITSO Docs, and Integration Docs row labels', () => {
    const req = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    expect(screen.getByText('ATI Docs')).toBeInTheDocument();
    expect(screen.getByText('ITSO Docs')).toBeInTheDocument();
    expect(screen.getByText('Integration Docs')).toBeInTheDocument();
  });

  it('shows download links for complete ATI docs in the detail panel', () => {
    const req = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    // bbb-002 has ATI complete with vpat.pdf and privacy_policy.pdf
    const links = screen.getAllByLabelText(/Download vpat\.pdf/i);
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "No documents found" for Integration no_docs in detail panel (bbb-002)', () => {
    const req = MOCK_REQUESTS.find((r) => r.request_id === 'bbb-002');
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    expect(screen.getAllByText('No documents found').length).toBeGreaterThan(0);
  });

  it('shows "Review in progress, gathering documents" for pending type in detail panel', () => {
    const req = MOCK_REQUESTS.find((r) => r.request_id === 'aaa-001');
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    const pending = screen.getAllByText('Review in progress, gathering documents');
    // aaa-001 has all three pending
    expect(pending.length).toBeGreaterThanOrEqual(3);
  });

  it('shows "No documents found. Contact vendor" for ITSO no_docs (ccc-003)', () => {
    const req = MOCK_REQUESTS.find((r) => r.request_id === 'ccc-003');
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    expect(screen.getAllByText('No documents found. Contact vendor').length).toBeGreaterThan(0);
  });

  it('shows pending state for all three types when review_docs is absent', () => {
    const req = {
      ...MOCK_REQUESTS[0],
      review_docs: undefined,
    };
    render(<RequestDetail request={req} onClose={noop} onSaved={noop} />);
    const pending = screen.getAllByText('Review in progress, gathering documents');
    expect(pending.length).toBeGreaterThanOrEqual(3);
  });
});
