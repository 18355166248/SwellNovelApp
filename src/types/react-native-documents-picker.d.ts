declare module '@react-native-documents/picker' {
  export const types: any;
  export function isCancel(err: unknown): boolean;
  export interface PickerOptions {
    allowMultiSelection?: boolean;
    types?: any[];
    copyTo?: 'cachesDirectory' | 'documentDirectory';
  }
  const DocPicker: (options?: PickerOptions) => Promise<any[]>;
  export default DocPicker;
}
