export enum ResponseStatusEnum {
  Success = "success",
  Error = "error",
}

type Pagination = {
  totalCount: number;
  page: number;
  limit: number;
};

export type ErrorDetails = {
  type: string;
  message: string;
  details?: {
    message: string;
  }[];
};

export type SuccessResponse<T> = {
  status: ResponseStatusEnum.Success;
  data: T;
  pagination?: Pagination;
};

export type ErrorResponse = {
  status: ResponseStatusEnum.Error;
  error: ErrorDetails;
};

/**
 * Create a typed API response
 * @param data - The data payload for a success response, or error details for an error response.
 * @param pagination - The pagination object for a success response.
 */
export function createResponse<T>(
  data: T,
  pagination?: Pagination,
): SuccessResponse<T> {
  return {
    // @ts-ignore
    success: true,
    status: ResponseStatusEnum.Success,
    data: data,
    pagination,
  };
}

export function createErrorResponse(payload: ErrorDetails): ErrorResponse {
  const errorPayload = payload as ErrorDetails & {
    success?: boolean;
    title?: string;
  };
  errorPayload.success = false;
  errorPayload.title = errorPayload.type;
  return {
    status: ResponseStatusEnum.Error,
    error: payload,
  };
}
