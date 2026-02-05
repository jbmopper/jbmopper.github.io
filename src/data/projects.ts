export interface Project {
  slug: string;
  title: string;
  description: string;
  /** Optional: filename (no path) of Marimo WASM export, e.g. "my-notebook.html". Linked from project page. */
  notebook?: string;
  /** Optional: writeup body. Can be HTML or plain text; switch to Markdown/Content Collection later if needed. */
  body?: string;
}

export const projects: Project[] = [
  {
    slug: "example",
    title: "Example project",
    description: "A placeholder project. Add real entries and export Marimo notebooks to public/notebooks/.",
    body: "<p>Replace this with your writeup. When you add a notebook, set <code>notebook: \"your-notebook.html\"</code> in <code>src/data/projects.ts</code> and export with <code>marimo export html-wasm content/notebooks/your-notebook.py -o public/notebooks --mode run</code>.</p>",
  },
  {
    slug: "local-tiny",
    title: "local-tiny (test)",
    description: "Architecture analysis on the M4",
    notebook: "local_tiny/index.html",
    body: "<p>This is a writeup??</p>",
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectNotebookUrl(project: Project): string | null {
  if (!project.notebook) return null;
  return `/notebooks/${project.notebook}`;
}
