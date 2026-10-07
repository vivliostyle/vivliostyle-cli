# PDF/X-4

An example of PDF output labeled as PDF/X-4 with `pdfPostprocess.pdfxLabel`, together with CMYK colors and an output intent. PDF/X does not allow Link annotations inside the printed area, so `documentProcessor` turns every `<a>` element of the Markdown into a `<span>`.

`ps_cmyk.icc` is used as the output intent profile only so that the example builds as it is; replace it with the profile of the printing condition that the print provider specifies. See `ICC-PROFILES-LICENSE` for its license.
