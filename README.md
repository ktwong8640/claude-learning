# Claude Learning

A simple interactive counter page built with plain HTML, CSS, and JavaScript — no build step or dependencies required.

## Running the project

Since this is a single static HTML file, you can open it directly in a browser:

1. Double-click `index.html`, or
2. Run it from the command line:

   ```
   start index.html          # Windows
   open index.html           # macOS
   xdg-open index.html       # Linux
   ```

### Optional: serve it locally

If you'd prefer to load it over `http://` instead of `file://` (e.g. to test with dev tools that expect a server), you can use any static file server, for example:

```
npx serve .
```

Then visit the printed local URL in your browser.

## What it does

- **+** increases the count
- **−** decreases the count
- **Reset** sets the count back to zero
