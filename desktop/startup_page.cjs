/**
 * The interface shown before the local engine is serving one.
 *
 * `main.cjs` used to open no window until `/health` answered, so every way
 * starting could go wrong -- a blocked binary, a quarantined executable, a
 * slow first run -- looked identical from the outside: nothing happened. A
 * modal dialog was the only report, and a modal raised by an application with
 * no window is easy to miss and impossible to copy text out of.
 *
 * These pages replace that silence. They are plain strings rather than files
 * in `dist/` because the window has to be able to show them before anything
 * has been unpacked or served, including when the engine never starts.
 */

/** Shared shell, styled to match the dashboard's own background. */
function page(body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';
 style-src 'unsafe-inline'">
<title>SpikeForge Desktop</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; background: #0d1117; color: #e6edf3;
    font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 34rem; padding: 2.5rem; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
  p { margin: 0 0 0.75rem; color: #9daab7; }
  .detail {
    white-space: pre-wrap; word-break: break-word; background: #161b22;
    border: 1px solid #30363d; border-radius: 6px; padding: 0.75rem 1rem;
    color: #e6edf3; font-family: ui-monospace, monospace; font-size: 13px;
  }
  .spinner {
    width: 1rem; height: 1rem; border: 2px solid #30363d;
    border-top-color: #58a6ff; border-radius: 50%; display: inline-block;
    margin-right: 0.5rem; vertical-align: -2px;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/** Escape text that came from an error or a filesystem path. */
function escape(text) {
  return String(text).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

/** Shown while the engine is starting. */
function startingPage() {
  return page(
    `<h1><span class="spinner"></span>Starting the SpikeForge engine</h1>
     <p>The first start after an update takes longer, because the engine
     unpacks before it runs.</p>`,
  );
}

/**
 * Shown when the engine did not start.
 *
 * The log path is included as text so it can be read and copied even when
 * opening the folder is what is failing.
 */
function failedPage(message, logPath) {
  const log = logPath
    ? `<p>The engine's own output is in this file:</p>
       <p class="detail">${escape(logPath)}</p>`
    : "<p>The engine stopped before it could write a log.</p>";
  return page(
    `<h1>SpikeForge Desktop could not start its engine</h1>
     <p class="detail">${escape(message)}</p>
     ${log}`,
  );
}

/** Wrap a page as a URL the window can load with no server running. */
function pageUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

module.exports = { failedPage, pageUrl, startingPage };
