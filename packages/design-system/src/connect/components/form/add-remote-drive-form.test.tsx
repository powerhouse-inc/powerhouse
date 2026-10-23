import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddRemoteDriveForm } from "./add-remote-drive-form.impl.js";

const URL = "http://localhost:4001/d/stock";

function renderForm() {
  const onSubmit = vi.fn();
  const requestPublicDrive = vi.fn(() =>
    Promise.resolve({ id: "stock", name: "Stockroom" }),
  );
  render(
    <AddRemoteDriveForm
      sharingType="PUBLIC"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      requestPublicDrive={requestPublicDrive}
    />,
  );
  return { onSubmit, requestPublicDrive };
}

describe("AddRemoteDriveForm", () => {
  // A click before the lookup used to show the confirm step, then the debounce reset it.
  it("waits for the typed URL's drive before it can be confirmed", async () => {
    const { onSubmit, requestPublicDrive } = renderForm();
    fireEvent.change(screen.getByPlaceholderText("Drive URL"), {
      target: { value: URL },
    });
    const confirm = screen.getByRole("button", { name: "Add drive" });
    expect(confirm).toHaveProperty("disabled", true);

    await waitFor(() => expect(confirm).toHaveProperty("disabled", false), {
      timeout: 2000,
    });
    expect(requestPublicDrive).toHaveBeenCalledWith(URL);
    fireEvent.click(confirm);
    expect(screen.getByText("Stockroom")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add new drive" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ id: "stock", name: "Stockroom", url: URL }),
      ),
    );
  });

  it("can't be confirmed while a changed URL is looked up", async () => {
    renderForm();
    const input = screen.getByPlaceholderText("Drive URL");
    fireEvent.change(input, { target: { value: URL } });
    const confirm = screen.getByRole("button", { name: "Add drive" });
    await waitFor(() => expect(confirm).toHaveProperty("disabled", false), {
      timeout: 2000,
    });
    fireEvent.change(input, { target: { value: `${URL}-2` } });
    expect(confirm).toHaveProperty("disabled", true);
  });
});
