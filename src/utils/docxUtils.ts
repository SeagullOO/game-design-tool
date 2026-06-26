/**
 * docxUtils.ts — .docx 文件双向转换
 *
 * 读取：mammoth .docx 二进制 → HTML（Tiptap 编辑器使用）
 * 写入：Tiptap HTML → altChunk DOCX 容器（JSZip）→ .docx 二进制 → 磁盘
 *       使用 altChunk 方式将 HTML 嵌入最小 DOCX ZIP 容器，
 *       Word / WPS 打开时自动将 HTML 转为原生格式。
 */

import mammoth from "mammoth";
import JSZip from "jszip";
import { arrayBufferToBase64 } from "./xlsxUtils";

type MammothFull = typeof mammoth & {
  convertToHtml(input: { buffer: Buffer }): Promise<{ value: string; messages: unknown[] }>;
};

const m = mammoth as MammothFull;

// ═══════════════════════════════════════════════════════════════════════════
// altChunk DOCX 容器模板（最小可用 .docx 结构）
// ═══════════════════════════════════════════════════════════════════════════

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/afchunk.mht" ContentType="message/rfc822"/>
  <Override PartName="/word/gull-content.html" ContentType="text/html"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk"
    Target="/word/afchunk.mht" Id="htmlChunk" />
</Relationships>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
  </w:body>
</w:document>`;


// ═══════════════════════════════════════════════════════════════════════════
// 导入方向：.docx 二进制 → HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * .docx ArrayBuffer → HTML 字符串
 */
export async function docxToHtml(buffer: ArrayBuffer): Promise<string> {
  const result = await m.convertToHtml({ buffer: Buffer.from(buffer) });
  return result.value;
}

/**
 * 清理 mammoth 输出的 HTML，仅移除 MS Office 特有标记
 *
 * 注意：只剥离 mso-* 前缀的 CSS 属性和 Mso* 类名，
 * 保留 Tiptap 生成的格式属性（text-align、selectedCell 等），
 * 确保 Gull 生成的 DOCX 回读时格式不丢失。
 */
export function sanitizeDocxHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, "[图片]")
    .replace(/<br\s*\/?>/gi, "<br>")
    .replace(/<hr[^>]*>/gi, "<p>---</p>")
    // 仅剥离 mammoth/MS 专属的 CSS 属性（mso-* 前缀），保留 text-align 等标准属性
    .replace(/mso-[^;";]*(;?\s*)/gi, "")
    // 仅剥离 MS Office 专属类名（MsoNormal、MsoListParagraph 等）
    .replace(/\bMso\w*\b/gi, "")
    // 清理由此产生的空 style / class 属性
    .replace(/\s*style="\s*(;?\s*)*\s*"/gi, "")
    .replace(/\s*class="\s*"/gi, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// 导出方向：HTML → altChunk .docx → base64
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTML 片段 → .docx ArrayBuffer（altChunk + MHT multipart + JSZip）
 *
 * 使用与 html-docx-js 相同的 multipart/related MHT 格式，
 * quoted-printable 编码 + charset="utf-8" 声明，
 * Word 能可靠识别 UTF-8 编码的中文内容。
 */
export async function htmlToDocxBuffer(html: string): Promise<ArrayBuffer> {
  const htmlDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: 'Microsoft YaHei', '微软雅黑', sans-serif; font-size: 12pt; line-height: 1.6; }
  h1 { font-size: 18pt; font-weight: bold; margin: 12pt 0 6pt 0; }
  h2 { font-size: 15pt; font-weight: bold; margin: 10pt 0 4pt 0; }
  h3 { font-size: 13pt; font-weight: bold; margin: 8pt 0 4pt 0; }
  p { margin: 0 0 6pt 0; }
  ul, ol { margin: 0 0 6pt 0; padding-left: 24pt; }
  li { margin: 0 0 2pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
  td, th { border: 1px solid #999; padding: 4pt 6pt; }
  blockquote { border-left: 3px solid #ccc; margin: 6pt 0; padding: 4pt 12pt; color: #555; }
</style>
</head>
<body>${html}</body>
</html>`;

  // quoted-printable: 仅需转义 =（Content-Type 声明 charset=utf-8，
  // Word 会按 UTF-8 解释所有字节，中文不会有问题）
  const qpHtml = htmlDoc.replace(/=/g, "=3D");

  // multipart/related MHT（与 html-docx-js 完全一致的格式）
  const mhtContent =
    "MIME-Version: 1.0\r\n" +
    "Content-Type: multipart/related;\r\n" +
    "\ttype=\"text/html\";\r\n" +
    "\tboundary=\"----=mhtDocumentPart\"\r\n" +
    "\r\n" +
    "\r\n" +
    "------=mhtDocumentPart\r\n" +
    "Content-Type: text/html;\r\n" +
    "\tcharset=\"utf-8\"\r\n" +
    "Content-Transfer-Encoding: quoted-printable\r\n" +
    "Content-Location: file:///C:/fake/document.html\r\n" +
    "\r\n" +
    qpHtml +
    "\r\n" +
    "\r\n" +
    "------=mhtDocumentPart--\r\n";

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", RELS_XML);
  zip.file("word/document.xml", DOCUMENT_XML);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS_XML);
  zip.file("word/afchunk.mht", mhtContent);
  // 存储原始 HTML，供 Gull 回读（mammoth 无法解析 altChunk DOCX）
  zip.file("word/gull-content.html", htmlDoc);

  return zip.generateAsync({ type: "arraybuffer" });
}

/**
 * 从 .docx 二进制中提取原始 HTML 内容（反向读取 gull-content.html）
 * 用于 Gull 重新打开自己生成的 DOCX 文件。
 */
export async function docxExtractHtml(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/gull-content.html");
  if (!file) throw new Error("Not a Gull-generated DOCX");
  return file.async("string");
}

/**
 * HTML 字符串 → base64 .docx 字符串
 */
export async function htmlToDocxBase64(html: string): Promise<string> {
  const buffer = await htmlToDocxBuffer(html);
  return arrayBufferToBase64(buffer);
}

/**
 * 创建空 .docx 文件的 base64 内容
 */
export async function createEmptyDocxBase64(): Promise<string> {
  return htmlToDocxBase64("<p></p>");
}

/** 空 docx 默认 HTML 内容（Tiptap 编辑器使用） */
export const DEFAULT_DOCX_HTML = "<p></p>";
