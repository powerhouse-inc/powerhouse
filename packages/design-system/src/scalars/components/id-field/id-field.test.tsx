import { Form } from "#scalars";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdField } from "./id-field";

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

  it("should use nanoid generator by default", () => {
    vi.mock("nanoid", () => ({
      nanoid: () => "aaa",
    }));

    render(
      <Form onSubmit={() => {}}>
        <IdField data-testid="id-field" />
      </Form>,
    );

    const input = screen.getByTestId("id-field");
    expect(input).toHaveValue("aaa");
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
        <IdField data-testid="id-field" generator="uuid" />
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
