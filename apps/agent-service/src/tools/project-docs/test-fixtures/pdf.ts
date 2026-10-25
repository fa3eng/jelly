/**
 * 生成测试用的标准 PDF：每个数组元素是一页；null 是无文字页。
 * 使用显式 ToUnicode 映射，测试中文提取不依赖本机字体或第三方下载资料。
 * 仅测试夹具使用，生产解析代码不依赖此构造器。
 */
export function makePdf(pages: (string | null)[]): Buffer {
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageRefs = pages.map((_, index) => `${7 + index * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
  objects.push(
    '<< /Type /Font /Subtype /Type0 /BaseFont /JellyTest /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>',
  );
  objects.push(
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /JellyTest /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 500 >>',
  );
  objects.push(
    '<< /Type /FontDescriptor /FontName /JellyTest /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>',
  );
  const stream = (content: string) =>
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  objects.push(
    stream(
      '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /JellyTest def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend',
    ),
  );
  pages.forEach((text, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${8 + index * 2} 0 R >>`,
    );
    const hex =
      text === null
        ? ''
        : Array.from(text, (character) =>
            character.charCodeAt(0).toString(16).padStart(4, '0'),
          ).join('');
    objects.push(
      stream(
        text === null
          ? ''
          : `BT /F1 ${(text?.length ?? 0) > 1000 ? 0.01 : 12} Tf 50 700 Td <${hex}> Tj ET`,
      ),
    );
  });
  let content = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
