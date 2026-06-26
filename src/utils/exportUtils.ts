/**
 * exportUtils.ts — 工作区导出工具
 *
 * 将整个工作区（包含 Markdown、Word 和 Excel 文件）导出为本地文件。
 *
 * 导出流程：
 * 1. 遍历文件夹中的所有文件
 * 2. Markdown 文件：将 TipTap JSON 转为标准 Markdown 格式，
 *    处理 fileLink（文件引用）和 spreadsheetBlock（嵌入表格）等特殊节点，
 *    嵌入的表格导出为独立的 CSV 文件
 * 3. Word 文档：HTML → @turbodocx/html-to-docx → .docx 二进制导出
 * 4. Excel 表格：data → exceljs → .xlsx 二进制导出（保留样式）
 * 3. Excel 文件：导出为真正的 .xlsx 文件（保留颜色/粗体/斜体/字号）
 * 4. 使用 storageExportFiles 统一导出（Electron: 原生文件对话框; 浏览器: Blob 下载）
 *
 * 导出：
 * - exportFolder(folder): 导出整个文件夹，返回描述字符串
 */

import type { Folder, FolderFile } from "../types";
import { storageExportFiles } from "../storage";
import { dataToXlsxBase64 } from "./xlsxUtils";
import { htmlToDocxBase64 } from "./docxUtils";

/** TipTap/ProseMirror 节点结构（导出转换时使用） */
interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

/** 嵌入表格的临时数据结构 */
interface SpreadsheetData {
  data: string[][];
  colHeaders: string[];
}

/** Markdown 转换过程中提取的嵌入表格列表（单次导出临时使用，global 作用域） */
let extractedSpreadsheets: SpreadsheetData[] = [];

function resetExtracted() {
  extractedSpreadsheets = [];
}

/** 将二维数组转为 CSV 字符串（单元格含引号和逗号时自动转义） */
function toCsv(data: string[][]): string {
  return data
    .map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/**
 * 将 TipTap mark 标记包裹为 Markdown 语法
 */
function wrapMarks(
  text: string,
  marks?: TipTapNode["marks"],
  files?: FolderFile[]
): string {
  if (!marks) return text;
  let result = text;
  for (const mark of marks) {
    if (mark.type === "bold") result = `**${result}**`;
    if (mark.type === "italic") result = `*${result}*`;
    if (mark.type === "code") result = "`" + result + "`";
    if (mark.type === "link") {
      const href = ((mark.attrs as any)?.href || "") as string;
      result = `[${result}](${href})`;
    }
    if (mark.type === "fileLink") {
      const fileId = ((mark.attrs as any)?.fileId || "") as string;
      const fileName = ((mark.attrs as any)?.fileName || "") as string;
      if (files) {
        const target = files.find((f) => f.id === fileId);
        if (target) {
          const relPath = target.type === "md" ? `./${target.name}` : `./${target.name}`;
          result = `[${target.name}](${relPath})`;
        } else {
          result = `[${fileName}](.)`;
        }
      } else {
        result = `[${fileName}](.)`;
      }
    }
  }
  return result;
}

function processInline(node: TipTapNode, files?: FolderFile[]): string {
  if (node.type === "text") {
    return wrapMarks(node.text || "", node.marks, files);
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.content) {
    return node.content.map((n) => processInline(n, files)).join("");
  }
  return "";
}

function processBlock(node: TipTapNode, files?: FolderFile[]): string {
  switch (node.type) {
    case "doc":
      return (node.content || []).map((n) => processBlock(n, files)).join("\n\n");

    case "heading": {
      const level = ((node.attrs as any)?.level || 1) as number;
      const prefix = "#".repeat(level);
      const text = (node.content || []).map((n) => processInline(n, files)).join("");
      return `${prefix} ${text}`;
    }

    case "paragraph": {
      const text = (node.content || []).map((n) => processInline(n, files)).join("");
      return text || "";
    }

    case "bulletList":
      return (node.content || [])
        .map((item) => {
          const text = ((item as any)?.content || [])
            .map((li: TipTapNode) => {
              if (li.type === "listItem") {
                return (li.content || [])
                  .map((p: TipTapNode) => {
                    if (p.type === "paragraph")
                      return (p.content || []).map((n) => processInline(n, files)).join("");
                    return processBlock(p, files);
                  })
                  .join(" ");
              }
              return processBlock(li, files);
            })
            .join(" ");
          return `- ${text}`;
        })
        .join("\n");

    case "orderedList":
      return (node.content || [])
        .map((item, i) => {
          const text = ((item as any)?.content || [])
            .map((li: TipTapNode) => {
              if (li.type === "listItem") {
                return (li.content || [])
                  .map((p: TipTapNode) => {
                    if (p.type === "paragraph")
                      return (p.content || []).map((n) => processInline(n, files)).join("");
                    return processBlock(p, files);
                  })
                  .join(" ");
              }
              return processBlock(li, files);
            })
            .join(" ");
          return `${i + 1}. ${text}`;
        })
        .join("\n");

    case "blockquote":
      return (node.content || [])
        .map((child) =>
          `> ${processBlock(child, files).replace(/\n/g, "\n> ")}`
        )
        .join("\n");

    case "codeBlock":
      return (
        "```\n" +
        (node.content || []).map((n) => processInline(n, files)).join("") +
        "\n```"
      );

    case "horizontalRule":
      return "---";

    case "table": {
      const rows: string[][] = [];
      for (const row of node.content || []) {
        if (row.type === "tableRow") {
          const cells: string[] = [];
          for (const cell of row.content || []) {
            cells.push((cell.content || []).map((n) => processInline(n, files)).join(""));
          }
          rows.push(cells);
        }
      }
      if (rows.length === 0) return "";
      const colCount = Math.max(...rows.map((r) => r.length));
      const header =
        "| " + rows[0].map((c) => c || " ").join(" | ") + " |";
      const sep = "|" + Array(colCount).fill(" --- ").join("|") + "|";
      const body = rows
        .slice(1)
        .map((r) => "| " + r.map((c) => c || " ").join(" | ") + " |")
        .join("\n");
      return header + "\n" + sep + (body ? "\n" + body : "");
    }

    case "spreadsheetBlock": {
      const data = ((node.attrs as any)?.data || []) as string[][];
      const index = extractedSpreadsheets.length + 1;
      extractedSpreadsheets.push({
        data,
        colHeaders: ((node.attrs as any)?.colHeaders || []) as string[],
      });
      return `[📊 嵌入表格 ${index} — 见导出文件夹中的 表格_${index}.xlsx]`;
    }

    case "excelFileLink": {
      const fileName = ((node.attrs as any)?.fileName || "") as string;
      return `📎 [引用Excel: ${fileName}]`;
    }

    default:
      if (node.content) {
        return (node.content || []).map((n) => processBlock(n, files)).join("\n\n");
      }
      return processInline(node, files);
  }
}

function tipTapJsonToMarkdown(doc: TipTapNode, files?: FolderFile[]): string {
  resetExtracted();
  return processBlock(doc, files);
}

/**
 * 导出整个工作区文件夹
 *
 * 为每个文件生成可发布的格式：
 * - .md 文件保持原样（包含嵌入表格的引用说明）
 * - .docx 文件生成真正的 .docx 二进制文件
 * - Excel 文件生成真实的 .xlsx 文件（保留样式）
 *
 * @param folder 要导出的文件夹对象
 * @returns 导出结果描述字符串（如 "已导出 5 个文件"）
 */
export async function exportFolder(folder: Folder): Promise<string> {
  const safeName =
    folder.name.replace(/[<>:"/\\|?*]/g, "_").trim() || "文件夹";

  const fileContents: Array<{ name: string; content: string; encoding?: "base64" }> = [];

  for (const file of folder.files) {
    if (file.type === "md") {
      // Markdown 文件导出为 .md
      const md = tipTapJsonToMarkdown(file.content as TipTapNode, folder.files);
      fileContents.push({ name: file.name, content: md });

      // 导出 Markdown 中嵌入的表格为独立 CSV 文件
      for (let i = 0; i < extractedSpreadsheets.length; i++) {
        const sheet = extractedSpreadsheets[i];
        const baseName = file.name.replace(/\.md$/, "");
        const csvName = `${baseName}_表格_${i + 1}.csv`;
        fileContents.push({ name: csvName, content: toCsv(sheet.data) });
      }
    } else if (file.type === "docx") {
      // Word 文档：HTML → .docx 二进制 → 导出为真正的 .docx 文件
      const htmlContent = typeof file.content === "string" ? file.content : "<p></p>";
      const docxBase64 = await htmlToDocxBase64(htmlContent);
      fileContents.push({ name: file.name, content: docxBase64, encoding: "base64" });
    } else if (file.type === "excel") {
      const excelData = file.content?.data as string[][] | undefined;
      const colHeaders = file.content?.colHeaders as string[] | undefined;
      const cellMeta = file.content?.cellMeta as any[][] | undefined;
      // 导出为真正的 .xlsx 文件（保留颜色/粗体/斜体/字号）
      const xlsxBase64 = await dataToXlsxBase64(excelData || [[]], colHeaders || [], cellMeta);
      const xlsxName = file.name.replace(/\.(csv|xlsx)$/i, ".xlsx").replace(/\.json$/i, ".xlsx");
      const exportName = xlsxName.endsWith(".xlsx") ? xlsxName : xlsxName + ".xlsx";
      fileContents.push({ name: exportName, content: xlsxBase64, encoding: "base64" });
    }
  }

  // 使用统一的存储抽象层执行实际文件写入/下载
  const exportFiles = fileContents.map((f) => ({
    relativePath: safeName + "/" + f.name,
    content: f.content,
    encoding: f.encoding as "base64" | undefined,
  }));
  return storageExportFiles(exportFiles);
}
