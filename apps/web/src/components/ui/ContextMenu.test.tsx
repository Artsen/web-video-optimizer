import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("opens actions, closes with Escape, and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ContextMenu label="More actions for output.mp4" items={[{ label: "Rename", onSelect: onRename }]} />);

    const trigger = screen.getByRole("button", { name: "More actions for output.mp4" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("runs menu actions and returns focus after selection", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ContextMenu label="More actions for output.mp4" items={[{ label: "Rename", onSelect: onRename }]} />);

    const trigger = screen.getByRole("button", { name: "More actions for output.mp4" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
