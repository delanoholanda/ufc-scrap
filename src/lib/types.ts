export type ScrapedDataRow = {
  codigo: string;
  componente: string;
  docente: string;
  turma: string;
  matricula: string;
  nome: string;
  curso: string;
  tipoReserva: string;
  situacao: string;
  idTurma?: string; // transient, used during scraping
};

export type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  salt: string;
  hash: string;
  createdAt?: string;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: string | null;
};

export type ExtractionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type Extraction = {
  id: number;
  year: number;
  semester: number;
  status: ExtractionStatus;
  createdAt: string;
};

export type CSVFile = {
    filename: string;
    content: string;
}

export type ExtractionLog = {
    id: number;
    extraction_id: number;
    log_message: string;
    timestamp: string;
}
