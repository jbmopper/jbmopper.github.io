import { describe, it, expect } from "vitest";
import {
  projects,
  getProjectBySlug,
  getProjectNotebooksDir,
  getProjectNotebookRootUrl,
  type Project,
} from "./projects";

describe("getProjectBySlug", () => {
  it("returns project when slug exists", () => {
    expect(getProjectBySlug("local-tiny")).toEqual(
      expect.objectContaining({ slug: "local-tiny", title: "local-tiny (test)" })
    );
  });

  it("returns undefined when slug does not exist", () => {
    expect(getProjectBySlug("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty slug when no project has empty slug", () => {
    expect(getProjectBySlug("")).toBeUndefined();
  });
});

describe("getProjectNotebooksDir", () => {
  it("returns notebooksDir when set", () => {
    const p: Project = {
      slug: "x",
      title: "X",
      description: "d",
      notebooksDir: "custom-dir",
    };
    expect(getProjectNotebooksDir(p)).toBe("custom-dir");
  });

  it("falls back to slug when notebooksDir not set", () => {
    const p: Project = {
      slug: "my-project",
      title: "My Project",
      description: "d",
    };
    expect(getProjectNotebooksDir(p)).toBe("my-project");
  });
});

describe("getProjectNotebookRootUrl", () => {
  it("returns /notebooks/<dir>/ when project has notebooks", () => {
    const p: Project = {
      slug: "local-tiny",
      title: "Local",
      description: "d",
      notebooksDir: "local-tiny",
    };
    expect(getProjectNotebookRootUrl(p)).toBe("/notebooks/local-tiny/");
  });

  it("uses slug when notebooksDir not set", () => {
    const p: Project = { slug: "s", title: "S", description: "d" };
    expect(getProjectNotebookRootUrl(p)).toBe("/notebooks/s/");
  });
});
