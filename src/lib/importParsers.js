import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls'];

function getFileExtension(fileName = '') {
  return `${fileName}`.split('.').pop()?.toLowerCase() || '';
}

function normalizeCellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return `${value}`.trim();
}

function rowsFromMatrix(matrix = []) {
  const nonEmptyRows = matrix.filter((row) => Array.isArray(row) && row.some((cell) => `${cell ?? ''}`.trim() !== ''));
  const headerRow = nonEmptyRows[0] || [];
  const columns = headerRow.map(normalizeCellValue).filter(Boolean);

  const rows = nonEmptyRows.slice(1).map((row, rowIndex) => {
    const record = {};
    columns.forEach((column, index) => {
      record[column] = normalizeCellValue(row[index]);
    });
    return {
      id: `row-${rowIndex + 2}`,
      rowNumber: rowIndex + 2,
      raw: record,
    };
  });

  return { columns, rows };
}

async function parseCsv(file) {
  const text = await file.text();
  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
  });
  const parsed = rowsFromMatrix(result.data || []);
  return {
    ...parsed,
    parserErrors: result.errors || [],
    sheetName: null,
  };
}

async function parseWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { columns: [], rows: [], parserErrors: [{ message: 'El archivo no tiene hojas.' }], sheetName: null };
  }
  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  return {
    ...rowsFromMatrix(matrix),
    parserErrors: [],
    sheetName,
  };
}

export async function parseImportFile(file) {
  if (!file) throw new Error('Selecciona un archivo.');
  const extension = getFileExtension(file.name);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv.');
  }

  const result = extension === 'csv' ? await parseCsv(file) : await parseWorkbook(file);
  return {
    ...result,
    fileName: file.name,
    fileType: extension,
    fileSize: file.size,
  };
}
