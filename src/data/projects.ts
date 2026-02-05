/**
 * One embedded Marimo (or other) export: a chart, table, or small interactive.
 * Export small, focused notebooks to public/notebooks/ and reference by path.
 */
export interface ProjectEmbed {
  /** Path under /notebooks/, e.g. "m4-chart.html" or "local_tiny/index.html". */
  path: string;
  /** Optional section heading above the embed (e.g. "Results", "Data preview"). */
  title?: string;
  /** Optional CSS height for the iframe, e.g. "400px" or "50vh". Defaults to a moderate height so the page stays readable. */
  height?: string;
}

export interface Project {
  slug: string;
  title: string;
  description: string;
  /** Main narrative: bulk text, structure, links. HTML for now; Content Collection later if needed. */
  body?: string;
  /**
   * Optional list of notebook-derived embeds (charts, tables, widgets).
   * Page design: narrative first (body), then each embed as its own section.
   * Use small, focused Marimo exports per embed rather than one big notebook-as-page.
   */
  embeds?: ProjectEmbed[];
  /**
   * @deprecated Prefer `embeds: [{ path, title }]`. If set, treated as a single full-page-style embed for backward compatibility.
   */
  notebook?: string;
}

export const projects: Project[] = [
  {
    slug: "example",
    title: "Example project",
    description: "A placeholder project. Add real entries and export Marimo notebooks to public/notebooks/.",
    body: "<p>Replace this with your writeup. Add <code>embeds</code> for small notebook outputs (e.g. one chart, one table) and keep the main story in <code>body</code>.</p>",
  },
  {
    slug: "local-tiny",
    title: "local-tiny (test)",
    description: "Architecture analysis on the M4",
    body: "<p>This is a writeup?? </p>",
    embeds: [{ path: "local_tiny/index.html", title: "Notebook" }],
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

/** All embeds for a project: from `embeds` array, or a single entry from legacy `notebook`. */
export function getProjectEmbeds(project: Project): ProjectEmbed[] {
  if (project.embeds?.length) return project.embeds;
  if (project.notebook) return [{ path: project.notebook, title: "Notebook" }];
  return [];
}

export function embedUrl(embed: ProjectEmbed): string {
  return `/notebooks/${embed.path}`;
}
