/**
 * Project notebooks live under content/notebooks/<notebooksDir>/:
 *   index.py = root/landing notebook (exported to public/notebooks/<notebooksDir>/)
 *   other .py = sibling notebooks (exported to public/notebooks/<notebooksDir>/<name>/)
 * The root notebook is the entry point; it can link to the others from within Marimo.
 */
export interface Project {
  slug: string;
  title: string;
  description: string;
  /** Main narrative on the project detail page. HTML for now. */
  body?: string;
  /**
   * If set, this project has notebooks. Directory name under content/notebooks/
   * (and under public/notebooks/ after export). Defaults to slug.
   * The root notebook is at /notebooks/<notebooksDir>/ (index.py).
   */
  notebooksDir?: string;
}

export const projects: Project[] = [
  {
    slug: "example",
    title: "Example project",
    description: "A placeholder project. Add real entries and notebook dirs under content/notebooks/.",
    body: "<p>Replace this with your writeup. Set <code>notebooksDir</code> and add <code>content/notebooks/&lt;dir&gt;/index.py</code> for the root notebook.</p>",
  },
  {
    slug: "local-tiny",
    title: "local-tiny (test)",
    description: "Architecture analysis on the M4",
    body: "<p>This is a writeup?? </p>",
    notebooksDir: "local-tiny",
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

/** Base directory for this project's notebooks (e.g. "local-tiny"). Undefined if no notebooks. */
export function getProjectNotebooksDir(project: Project): string | undefined {
  return project.notebooksDir ?? project.slug;
}

/** URL for the root/landing notebook. Use for "Open notebook" on index and project page. */
export function getProjectNotebookRootUrl(project: Project): string | null {
  const dir = getProjectNotebooksDir(project);
  if (!dir) return null;
  return `/notebooks/${dir}/`;
}
