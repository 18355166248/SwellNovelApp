declare module '@react-native-documents/picker' {
  export const types: any;
  export const errorCodes: {
    OPERATION_CANCELED: string;
    IN_PROGRESS: string;
    UNABLE_TO_OPEN_FILE_TYPE: string;
    NULL_PRESENTER: string;
  };
  export function isErrorWithCode(
    err: unknown,
  ): err is Error & { code: string };
  export interface DocumentPickerOptions {
    allowMultiSelection?: boolean;
    type?: string | string[];
    mode?: 'import' | 'open';
  }
  export interface DocumentPickerResponse {
    uri: string;
    name: string | null;
    type: string | null;
    nativeType: string | null;
    size: number | null;
    error: string | null;
    hasRequestedType: boolean;
  }
  export function pick(
    options?: DocumentPickerOptions,
  ): Promise<DocumentPickerResponse[]>;
  export function keepLocalCopy(options: {
    files: Array<{ uri: string; fileName: string }>;
    destination: 'cachesDirectory' | 'documentDirectory';
  }): Promise<
    Array<
      | { status: 'success'; sourceUri: string; localUri: string }
      | { status: 'error'; sourceUri: string; copyError: string }
    >
  >;
  export function saveDocuments(options: {
    sourceUris: string[];
    mimeType?: string;
    fileName?: string;
    copy?: boolean;
  }): Promise<Array<{ uri: string; name: string | null; error: string | null }>>;
}
