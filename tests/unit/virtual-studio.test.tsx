import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VirtualStudio } from "@/components/studio/virtual-studio";
import type { PreparedPhoto } from "@/lib/tryon/prepare-photo";

const PREVIEW_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function okPrepare(url = "blob:photo-1"): () => Promise<PreparedPhoto> {
  return async () => ({ ok: true, upload: new Blob(["x"], { type: "image/jpeg" }), previewUrl: url, width: 800, height: 1000 });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const tryOnOk = () =>
  jsonResponse(200, {
    data: {
      status: "ok",
      jobId: "job-1",
      styleId: "low-taper-fade",
      styleName: "Low Taper Fade",
      preview: { dataUrl: PREVIEW_DATA_URL, mediaType: "image/png" },
      label: "AI-generated simulation",
      disclaimer: "AI-generated simulation for consultation only. Results are not guaranteed.",
      generatedAt: new Date().toISOString(),
    },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

async function uploadPhoto(container: HTMLElement, name = "me.jpg") {
  const file = new File(["x"], name, { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(fileInput(container), { target: { files: [file] } });
  });
}

const generateButton = () => screen.getByRole("button", { name: /generate ai preview/i });
const consentBox = () => screen.getByRole("checkbox", { name: /consent to sending it to openai/i });

describe("VirtualStudio: initial state (FR-02)", () => {
  it("selects Low Taper Fade on first render", () => {
    render(<VirtualStudio prepare={okPrepare()} />);
    expect(screen.getByRole("radio", { name: "Low Taper Fade" })).toBeChecked();
    expect(screen.getAllByRole("radio", { name: /fade|crop|pompadour|buzz|part|crew/i }).filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("offers all six styles as an accessible radio group", () => {
    render(<VirtualStudio prepare={okPrepare()} />);
    for (const name of ["Low Taper Fade", "Textured Crop", "Pompadour", "Buzz Cut", "Side Part", "Crew Cut"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });
});

describe("VirtualStudio: upload and consent gate (FR-03, FR-05)", () => {
  it("disables Generate until a valid photo AND consent", async () => {
    const { container } = render(<VirtualStudio prepare={okPrepare()} />);
    expect(generateButton()).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await uploadPhoto(container);
    expect(consentBox()).not.toBeChecked(); // unchecked by default
    expect(generateButton()).toBeDisabled();

    fireEvent.click(consentBox());
    expect(generateButton()).toBeEnabled();
  });

  it("shows a readable error for an invalid photo and keeps Generate disabled", async () => {
    const { container } = render(<VirtualStudio prepare={async () => ({ ok: false, message: "Photos must be 8 MB or smaller." })} />);
    await uploadPhoto(container);
    expect(screen.getByRole("alert")).toHaveTextContent("8 MB");
    expect(generateButton()).toBeDisabled();
  });

  it("resets consent and the previous preview when the photo is replaced", async () => {
    fetchMock.mockResolvedValue(tryOnOk());
    let n = 0;
    const prepare = async () => (await okPrepare(`blob:photo-${++n}`)()) as PreparedPhoto;
    const { container } = render(<VirtualStudio prepare={prepare} />);
    await uploadPhoto(container);
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(generateButton()));
    expect(await screen.findAllByText(/AI-generated simulation/)).not.toHaveLength(0);
    expect(screen.getByRole("img", { name: /AI-generated simulation/ })).toBeInTheDocument();

    await uploadPhoto(container, "other.jpg");
    expect(consentBox()).not.toBeChecked();
    expect(generateButton()).toBeDisabled();
    expect(screen.queryByRole("img", { name: /AI-generated simulation/ })).not.toBeInTheDocument();
  });

  it("removing the photo clears consent and disables Generate", async () => {
    const { container } = render(<VirtualStudio prepare={okPrepare()} />);
    await uploadPhoto(container);
    fireEvent.click(consentBox());
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
  });
});

describe("VirtualStudio: generation (FR-07, FR-09, FR-11, FR-18)", () => {
  async function ready() {
    const utils = render(<VirtualStudio prepare={okPrepare()} />);
    await uploadPhoto(utils.container);
    fireEvent.click(consentBox());
    return utils;
  }

  it("sends photo, selected style, consent and a request key", async () => {
    fetchMock.mockResolvedValue(tryOnOk());
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "Pompadour" }));
    await act(async () => fireEvent.click(generateButton()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/try-on");
    const form = init.body as FormData;
    expect(form.get("styleId")).toBe("pompadour");
    expect(form.get("consent")).toBe("granted");
    expect(form.get("consentNoticeVersion")).toBeTruthy();
    expect(String(form.get("requestKey"))).toMatch(/^[0-9a-f-]{36}$/);
    expect(form.get("photo")).toBeInstanceOf(Blob);
  });

  it("prevents duplicate submissions while generating", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    await ready();
    fireEvent.click(generateButton());
    expect(await screen.findByRole("button", { name: /generating preview/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /generating preview/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: "Buzz Cut" })).toBeDisabled();
    await act(async () => resolve(tryOnOk()));
  });

  it("labels the result as an AI-generated simulation with a not-guaranteed disclaimer", async () => {
    fetchMock.mockResolvedValue(tryOnOk());
    await ready();
    await act(async () => fireEvent.click(generateButton()));
    const result = screen.getByRole("region", { name: /your preview/i });
    expect(within(result).getAllByText(/AI-generated simulation/).length).toBeGreaterThan(0);
    expect(within(result).getByText(/not guaranteed/)).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: /try another style/i })).toBeInTheDocument();
    expect(within(result).getByRole("link", { name: /book this style/i })).toHaveAttribute("href", "/appointments/new?styleId=low-taper-fade");
  });

  it("shows the server's safe error and never a fake image on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: { code: "AI_NOT_CONFIGURED", message: "AI previews aren't available right now." } }));
    await ready();
    await act(async () => fireEvent.click(generateButton()));
    expect(screen.getByRole("alert")).toHaveTextContent("AI previews aren't available right now.");
    expect(screen.queryByRole("img", { name: /AI-generated simulation/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });

  it("shows a countdown on rate limits", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: { code: "RATE_LIMITED", message: "Too quickly." } }, { "Retry-After": "30" }));
    await ready();
    await act(async () => fireEvent.click(generateButton()));
    expect(screen.getByRole("button", { name: /try again in \d+s/i })).toBeDisabled();
    expect(generateButton()).toBeDisabled();
  });

  it("handles network failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await ready();
    await act(async () => fireEvent.click(generateButton()));
    expect(screen.getByRole("alert")).toHaveTextContent(/network error/i);
  });
});

describe("VirtualStudio: before/after comparison (FR-10)", () => {
  async function withResult() {
    fetchMock.mockResolvedValue(tryOnOk());
    const utils = render(<VirtualStudio prepare={okPrepare()} />);
    await uploadPhoto(utils.container);
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(generateButton()));
  }

  it("has a labeled slider with a textual value", async () => {
    await withResult();
    const slider = screen.getByRole("slider", { name: /before \/ after divider/i });
    expect(slider).toHaveAttribute("aria-valuetext", "50% original, 50% AI preview");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(slider).toHaveAttribute("aria-valuetext", "80% original, 20% AI preview");
  });

  it("offers separate Original and AI preview views", async () => {
    await withResult();
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByRole("button", { name: "Original" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: /original photo/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /AI-generated simulation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI preview" }));
    expect(screen.getByRole("img", { name: /AI-generated simulation.*Low Taper Fade/ })).toBeInTheDocument();
  });
});

describe("VirtualStudio: AI Hairstyle Advisor (FR-19)", () => {
  it("shows recommendations and lets the user choose one", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: {
          status: "ok",
          recommendations: [
            { styleId: "buzz-cut", styleName: "Buzz Cut", reason: "Short and easy, as you asked." },
            { styleId: "crew-cut", styleName: "Crew Cut", reason: "Neat with little styling." },
            { styleId: "textured-crop", styleName: "Textured Crop", reason: "Short with texture." },
          ],
          caveat: "Results vary.",
          disclaimer: "Your barber will confirm in person.",
        },
      }),
    );
    render(<VirtualStudio prepare={okPrepare()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Short" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /suggest styles/i })));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/hairstyle-advice");
    expect(JSON.parse(init.body as string).preferences.lengthOnTop).toBe("short");

    expect(screen.getAllByText("Advisor pick")).toHaveLength(3);
    const choose = screen.getAllByRole("button", { name: /choose this style/i });
    fireEvent.click(choose[0]!);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Buzz Cut" })).toBeChecked());
  });

  it("shows advisor errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: { code: "AI_NOT_CONFIGURED", message: "The hairstyle advisor isn't available right now." } }));
    render(<VirtualStudio prepare={okPrepare()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /suggest styles/i })));
    expect(screen.getByRole("alert")).toHaveTextContent(/advisor isn't available/);
  });
});

describe("VirtualStudio: Save Look (FR-13)", () => {
  async function withResult() {
    fetchMock.mockResolvedValueOnce(tryOnOk());
    const utils = render(<VirtualStudio prepare={okPrepare()} />);
    await uploadPhoto(utils.container);
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(generateButton()));
    return utils;
  }

  const saveButton = () => screen.getByRole("button", { name: /save look/i });
  const storageBox = () => screen.getByRole("checkbox", { name: /storing their photo/i });

  it("needs a customer name and a separate, unchecked storage consent", async () => {
    await withResult();
    expect(storageBox()).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Juan" } });
    expect(saveButton()).toBeDisabled();
    fireEvent.click(storageBox());
    expect(saveButton()).toBeEnabled();
  });

  it("sends both images, the job id and storage consent; confirms only after the server succeeds", async () => {
    await withResult();
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: " Juan " } });
    fireEvent.click(storageBox());
    fireEvent.click(saveButton());

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/looks");
    const form = init.body as FormData;
    expect(form.get("tryOnJobId")).toBe("job-1");
    expect(form.get("customerLabel")).toBe("Juan");
    expect(form.get("storageConsent")).toBe("granted");
    expect(form.get("original")).toBeInstanceOf(Blob);
    expect((form.get("preview") as Blob).type).toBe("image/png");
    expect(screen.queryByText(/look saved/i)).not.toBeInTheDocument();

    await act(async () => resolve(jsonResponse(201, { data: { lookId: "look-1", duplicate: false } })));
    expect(screen.getByRole("status")).toHaveTextContent("Look saved for Juan");
    expect(screen.getByRole("link", { name: /view saved looks/i })).toHaveAttribute("href", "/studio/looks");
    expect(screen.getByRole("status")).toContainElement(screen.getAllByRole("link", { name: /book this style/i }).find((l) => l.getAttribute("href") === "/appointments/new?lookId=look-1")!);
  });

  it("shows the server's error and no success state when saving fails", async () => {
    await withResult();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: { code: "STORAGE_UNAVAILABLE", message: "The look couldn't be saved right now." } }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Juan" } });
    fireEvent.click(storageBox());
    await act(async () => fireEvent.click(saveButton()));
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't be saved");
    expect(screen.queryByText(/look saved/i)).not.toBeInTheDocument();
  });
});
