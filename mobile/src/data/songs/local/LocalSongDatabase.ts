export type LocalSongDatabaseConnection = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: any[]): Promise<{ changes: number }>;
  getFirstAsync<T>(source: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: any[]): Promise<T[]>;
};

export type LocalSongDatabase = LocalSongDatabaseConnection & {
  transactionAsync?<T>(task: (transaction: LocalSongDatabaseConnection) => Promise<T>): Promise<T>;
};
