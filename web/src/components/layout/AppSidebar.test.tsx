import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";

const renderSidebar = (initialPath = "/") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>
  );

describe("AppSidebar", () => {
  it("renders navigation links", () => {
    renderSidebar();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
  });

  it("marks current route as active", () => {
    renderSidebar("/namespaces");
    const activeLink = screen.getByText("Namespaces").closest("a");
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });
});
