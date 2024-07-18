export enum ResponseStatusEnum {
  Success = "success",
  Error = "error",
}

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
};

export type ErrorResponse = {
  status: ResponseStatusEnum.Error;
  error: ErrorDetails;
};

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Create a typed API response.
 * @param status - The response status
 * @param payload - The data payload for a success response, or error details for an error response.
 * @returns A typed ApiResponse object.
 */
export function createResponse<T>(
  status: ResponseStatusEnum.Success,
  data: T
): SuccessResponse<T>;
export function createResponse(
  status: ResponseStatusEnum.Error,
  error: ErrorDetails
): ErrorResponse;
export function createResponse<T>(
  status: ResponseStatusEnum,
  payload: T | ErrorDetails
): ApiResponse<T> {
  if (status === ResponseStatusEnum.Success) {
    return { status, data: payload as T };
  } else {
    const errorPayload = payload as ErrorDetails & {
      validation?: any;
      title?: string;
    };
    errorPayload.validation = errorPayload.details;
    errorPayload.title = errorPayload.type;
    return { status, error: payload as ErrorDetails };
  }
}
