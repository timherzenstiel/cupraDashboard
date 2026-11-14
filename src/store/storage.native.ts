import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dataset } from '../data/types';

const KEY = 'born-datenlabor/dataset';

export async function loadDataset(): Promise<Dataset | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const ds = raw ? (JSON.parse(raw) as Dataset) : null;
    return ds && ds.version === 1 ? ds : null;
  } catch {
    return null;
  }
}
export const saveDataset = (ds: Dataset) => AsyncStorage.setItem(KEY, JSON.stringify(ds));
export const clearDataset = () => AsyncStorage.removeItem(KEY);
