import { pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

/** Opens the system file picker and resolves with the chosen file's text, or null when cancelled. */
export async function pickExportFile(): Promise<string | null> {
  try {
    const [file] = await pick({ type: ['application/json'] });
    return await RNFS.readFile(decodeURIComponent(file.uri), 'utf8');
  } catch (e) {
    if ((e as { code?: string })?.code === 'OPERATION_CANCELED') return null;
    throw e;
  }
}
