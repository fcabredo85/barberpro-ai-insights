import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PhotoUpload } from "@/components/studio/photo-upload";

function setup(props: Partial<Parameters<typeof PhotoUpload>[0]> = {}) {
  const onSelect = vi.fn();
  const onRemove = vi.fn();
  const utils = render(<PhotoUpload previewUrl={null} onSelect={onSelect} onRemove={onRemove} {...props} />);
  return { ...utils, onSelect, onRemove };
}

function fakeStream() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  return { stream, stop };
}

function stubMediaDevices(getUserMedia: ((c: MediaStreamConstraints) => Promise<MediaStream>) | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : undefined,
  });
}

beforeEach(() => {
  // jsdom doesn't implement media playback.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  stubMediaDevices(undefined);
});

describe("PhotoUpload: photo sources", () => {
  it("offers Upload photo and Take photo when no photo is selected", () => {
    setup();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeInTheDocument();
  });

  it("offers upload, retake and remove once a photo is selected", () => {
    setup({ previewUrl: "blob:photo" });
    expect(screen.getByRole("button", { name: "Upload new photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retake photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("Upload photo opens the device file chooser and passes the chosen file on", () => {
    const { onSelect } = setup();
    const input = screen.getByLabelText("Upload photo from device") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    expect(click).toHaveBeenCalledOnce();

    const file = new File(["x"], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onSelect).toHaveBeenCalledWith(file);
    expect(input).not.toHaveAttribute("capture");
  });

  it("falls back to the native camera input when live camera is unavailable", () => {
    stubMediaDevices(undefined);
    const { onSelect } = setup();
    const input = screen.getByLabelText("Take photo with camera") as HTMLInputElement;
    expect(input).toHaveAttribute("capture", "user");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const file = new File(["x"], "camera.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onSelect).toHaveBeenCalledWith(file);
  });

  it("disables both sources while busy", () => {
    setup({ busy: true });
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
  });
});

describe("PhotoUpload: live camera dialog", () => {
  it("requests the front camera, captures a JPEG, and stops the camera", async () => {
    const { stream, stop } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    stubMediaDevices(getUserMedia);

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(960);

    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));

    expect(await screen.findByRole("dialog", { name: "Take a photo" })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: "user" }) }),
    );

    const captureButton = screen.getByRole("button", { name: "Capture" });
    await waitFor(() => expect(captureButton).toBeEnabled());
    await act(async () => {
      fireEvent.click(captureButton);
    });

    expect(drawImage).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledOnce();
    const file = onSelect.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/jpeg");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(stop).toHaveBeenCalled();
  });

  it("stops the camera when the dialog is cancelled without capturing", async () => {
    const { stream, stop } = fakeStream();
    stubMediaDevices(vi.fn().mockResolvedValue(stream));
    const { onSelect } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Capture" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(stop).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("explains a blocked camera and keeps Capture disabled", async () => {
    stubMediaDevices(vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")));
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/camera access was blocked/i);
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
  });
});
