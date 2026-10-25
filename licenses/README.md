# Vendored license texts

- `react-remove-scroll-bar.LICENSE`: upstream MIT text from <https://github.com/theKashey/react-remove-scroll-bar/blob/master/LICENSE>. Version 2.3.8 does not include a license file in its npm package.
- `pdfjs-dist-5.6.205.LICENSE`: Apache-2.0 text from <https://github.com/mozilla/pdf.js/blob/v5.6.205/LICENSE>. unpdf 1.6.2 bundles this PDF.js version.

`scripts/generate-notices.mjs` includes these files in the combined third-party notices. The plugin build retains the notices in `main.js` so the standard three-file installation carries them.
