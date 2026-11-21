type LibraryClient = {
  functions: {
    invoke(name: string, options: { body: { action: string; payload?: object } }): Promise<{
      data: unknown;
      error: unknown;
    }>;
  };
};
export function invokeLibrary<T>(client: LibraryClient | null, action: string, payload?: object): Promise<T>;
