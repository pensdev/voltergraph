import type { ChartData, ChartOptions } from '../charts/types.js';

/**
 * Everything drawn into the framebuffer is invisible to assistive tech, so
 * every chart also emits a real table. Building this in from the start is much
 * cheaper than retrofitting it, and it doubles as the no-JS/print fallback.
 */
export function createDataTable(): HTMLElement {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  return wrap;
}

export function updateDataTable(
  host: HTMLElement,
  data: ChartData,
  options: ChartOptions
): void {
  const format = options.format ?? ((v: number) => String(v));
  const rows: string[] = [];

  rows.push('<tr><th scope="col">Category</th>');
  for (const ds of data.datasets) rows.push(`<th scope="col">${escape(ds.label)}</th>`);
  rows.push('</tr>');

  data.labels.forEach((label, i) => {
    rows.push(`<tr><th scope="row">${escape(label)}</th>`);
    for (const ds of data.datasets) {
      const v = ds.data[i];
      rows.push(`<td>${v === undefined ? '' : escape(format(v))}</td>`);
    }
    rows.push('</tr>');
  });

  const caption = options.title ? `<caption>${escape(options.title)}</caption>` : '';
  host.innerHTML = `<table>${caption}${rows.join('')}</table>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  );
}
