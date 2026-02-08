export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

export function forbidden(message = 'Forbidden'): ErrorResponse {
  return { statusCode: 403, message, error: 'Forbidden' };
}

export function notFound(message = 'Not Found'): ErrorResponse {
  return { statusCode: 404, message, error: 'Not Found' };
}