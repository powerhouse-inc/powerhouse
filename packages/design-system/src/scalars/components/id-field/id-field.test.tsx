import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IdField } from "./id-field";
import { Form } from "@/scalars/components/form";
import userEvent from "@testing-library/user-event";

describe("IdField", () => {
  it("should render a hidden input field", () => {
    render(
      <Form onSubmit={() => {}}>
        <IdField data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveAttribute("type", "hidden");
    expect(input).toHaveAttribute("value");
  });

  it("should use default name 'id' when no name prop provided", () => {
    render(
      <Form onSubmit={() => {}}>
        <IdField data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveAttribute("name", "id");
  });

  it("should use custom name when name prop provided", () => {
    render(
      <Form onSubmit={() => {}}>
        <IdField name="customId" data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveAttribute("name", "customId");
  });

  it("should use provided value when value prop is set", () => {
    render(
      <Form onSubmit={() => {}}>
        <IdField value="static-id" data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue("static-id");
  });

  it("should use UUID generator by default", () => {
    const mockUUID = "00000000-0000-0000-0000-000000000000";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(mockUUID);

    render(
      <Form onSubmit={() => {}}>
        <IdField data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue(mockUUID);
  });

  it("should use custom generator function when provided", () => {
    const customGenerator = () => "custom-generated-id";

    render(
      <Form onSubmit={() => {}}>
        <IdField generator={customGenerator} data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue("custom-generated-id");
  });

  it("should generate new ID on form submission", async () => {
    const user = userEvent.setup();
    const mockUUID1 = "00000000-0000-0000-0000-000000000000";
    const mockUUID2 = "00000000-0000-0000-0000-000000000001";
    const mockRandomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(mockUUID1)
      .mockReturnValueOnce(mockUUID2);

    const handleSubmit = vi.fn();

    render(
      <Form onSubmit={handleSubmit}>
        <IdField data-testid="id-field" />
        <button type="submit">Submit</button>
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue(mockUUID1);

    await user.click(screen.getByRole("button"));

    expect(handleSubmit).toHaveBeenCalled();
    expect(input).toHaveValue(mockUUID2);
    expect(mockRandomUUID).toHaveBeenCalledTimes(2);
  });

  it("should not generate new ID on submission when value prop is provided", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <Form onSubmit={handleSubmit}>
        <IdField value="static-id" data-testid="id-field" />
        <button type="submit">Submit</button>
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue("static-id");

    await user.click(screen.getByRole("button"));

    expect(handleSubmit).toHaveBeenCalled();
    expect(input).toHaveValue("static-id");
  });

  it("should call custom generator on each submission", async () => {
    const user = userEvent.setup();
    const customGenerator = vi
      .fn()
      .mockReturnValueOnce("custom-id-1")
      .mockReturnValueOnce("custom-id-2");

    const handleSubmit = vi.fn();

    render(
      <Form onSubmit={handleSubmit}>
        <IdField generator={customGenerator} data-testid="id-field" />
        <button type="submit">Submit</button>
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue("custom-id-1");

    await user.click(screen.getByRole("button"));

    expect(handleSubmit).toHaveBeenCalled();
    expect(input).toHaveValue("custom-id-2");
    expect(customGenerator).toHaveBeenCalledTimes(2);
  });
});