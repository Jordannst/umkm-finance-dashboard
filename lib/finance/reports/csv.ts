import type { Transaction, TransactionType } from "@/types/finance";

const TYPE_LABEL: Record<TransactionType, string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  receivable_payment: "Pelunasan piutang",
};

/**
 * Escape satu cell CSV. Kalau berisi koma, kutip ganda, atau newline,
 * dibungkus dengan kutip ganda dan kutip dalam digandakan.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Generate CSV string dari list transaksi. Pakai header bahasa Indonesia
 * dan UTF-8 BOM agar aman dibuka di Excel versi lama.
 */
export function transactionsToCsv(transactions: Transaction[]): string {
  const header = [
    "Tanggal",
    "Tipe",
    "Kategori",
    "Catatan",
    "Jumlah",
    "Sumber",
    "Dibuat oleh",
  ];

  const lines = [csvRow(header)];

  for (const tx of transactions) {
    lines.push(
      csvRow([
        tx.transaction_date,
        TYPE_LABEL[tx.type] ?? tx.type,
        tx.category_name ?? "",
        tx.note ?? "",
        Number(tx.amount),
        tx.source,
        tx.created_by ?? "",
      ]),
    );
  }

  // BOM agar Excel auto-detect UTF-8
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
