export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function sectionHeading(text) {
  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.5rem 0";
  heading.textContent = text;
  return heading;
}

export function emptyState(message) {
  const p = document.createElement("p");
  p.style.margin = "0.5rem 0";
  p.style.padding = "0.75rem";
  p.style.border = "1px dashed var(--theme-foreground-faint)";
  p.style.borderRadius = "8px";
  p.textContent = message;
  return p;
}

export function renderSimpleTable(rows, columns) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.9rem";

  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column.label;
    th.style.textAlign = column.align || "left";
    th.style.borderBottom = "1px solid var(--theme-foreground-faint)";
    th.style.padding = "0.4rem";
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const trBody = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      td.style.padding = "0.35rem";
      td.style.borderBottom = "1px solid var(--theme-foreground-faintest)";
      td.style.textAlign = column.align || "left";
      const value = column.format ? column.format(row[column.key], row) : row[column.key];
      td.textContent = value == null ? "" : String(value);
      trBody.appendChild(td);
    }
    tbody.appendChild(trBody);
  }
  table.appendChild(tbody);

  return table;
}
