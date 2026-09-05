declare module "html2pdf.js" {
  type Html2PdfWorker = {
    set(options: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement): Html2PdfWorker;
    save(): Promise<void>;
  };
  const html2pdf: () => Html2PdfWorker;
  export default html2pdf;
}
