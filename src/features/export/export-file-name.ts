const MAX_TITLE_LENGTH = 72;

export function createExportFileStem(
  title: string,
  exportedAt: Date = new Date(),
): string {
  const normalizedTitle = title
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TITLE_LENGTH)
    .replace(/-+$/g, "");

  const safeTitle = normalizedTitle || "chatgpt-conversation";

  return [safeTitle, formatLocalDate(exportedAt)].join("-");
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
