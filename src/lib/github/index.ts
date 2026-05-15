export interface GeneratedRepositoryInput {
  storeId: string;
  name: string;
  templateRepository: string;
}

export interface GeneratedRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
}

export async function createGeneratedStoreRepository(
  input: GeneratedRepositoryInput,
): Promise<GeneratedRepository> {
  void input;
  // TODO: Create and seed GitHub repositories for generated storefronts.
  throw new Error("GitHub repository generation is not implemented yet.");
}
