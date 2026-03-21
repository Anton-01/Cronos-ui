export interface ErrorResponse {
  status: number;
  error: string;
  message: string;
  details: string[] | null;
  path: string;
  timestamp: string;
}
