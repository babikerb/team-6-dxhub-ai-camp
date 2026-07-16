import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequesterUpload from "./RequesterUpload.jsx";

vi.mock("../../api.js", () => ({
  getRequesterDocsContext: vi.fn(),
  uploadRequesterDoc: vi.fn(),
  submitRequesterDocLink: vi.fn(),
}));

import { getRequesterDocsContext } from "../../api.js";

function renderPage(id = "abc-123") {
  return render(
    <MemoryRouter initialEntries={[`/upload/${id}`]}>
      <Routes>
        <Route path="/upload/:requestId" element={<RequesterUpload />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequesterUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders software name and required documents", async () => {
    getRequesterDocsContext.mockResolvedValue({
      request_id: "abc-123",
      software_name: "Zoom Pro",
      status: "ITReview",
      max_upload_bytes: 15_000_000,
      documents: [
        {
          doc_type: "vpat",
          label: "VPAT accessibility conformance report",
          review_type: "ati",
          required: true,
          fulfilled: false,
        },
        {
          doc_type: "hecvat",
          label: "HECVAT security assessment questionnaire",
          review_type: "itso",
          required: true,
          fulfilled: true,
          filename: "hecvat_file.pdf",
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Zoom Pro")).toBeInTheDocument();
    });
    expect(screen.getByText("VPAT accessibility conformance report")).toBeInTheDocument();
    expect(screen.getByText("HECVAT security assessment questionnaire")).toBeInTheDocument();
    expect(screen.getByText(/1 document still needed/i)).toBeInTheDocument();
    expect(screen.getByText("hecvat_file.pdf")).toBeInTheDocument();
  });

  it("shows an error when context fails to load", async () => {
    getRequesterDocsContext.mockRejectedValue(new Error("No request found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No request found/i)).toBeInTheDocument();
    });
  });
});
